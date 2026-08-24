/* ============================================================================
 * useCameraAnalysis — the runtime that ties camera → canvas → engine → UI.
 *
 * Responsibilities:
 *   - acquire the camera (with graceful permission/error states)
 *   - draw the video into a small offscreen canvas at ANALYSIS_W x ANALYSIS_H
 *   - apply Demo Mode distortions IN PIXEL SPACE so the detector genuinely
 *     re-detects them (not just a CSS filter over the top — the real pipeline
 *     has to do the work, otherwise the demo would be a lie)
 *   - run the Tier-1 engine on a throttled rAF loop (~10fps analysis, video
 *     stays at native fps)
 *   - push results through the hysteresis stabilizer and emit state changes
 * ==========================================================================*/
import { useCallback, useEffect, useRef, useState } from 'react';
import { ANALYSIS_W, ANALYSIS_H, analyzeFrame, toGrayscale, laplacianStats } from './frameAnalysis.js';
import { classifyFrame, StateStabilizer, THRESHOLDS } from './classifyState.js';
import { applyDemoEffect } from './demoEffects.js';
import { blendWithModel, getModelStatus } from './mlModel.js';

const ANALYSIS_FPS = 10;
const FRAME_INTERVAL = 1000 / ANALYSIS_FPS;
const SPARK_LEN = 50; // ~5s of history at 10fps

export function useCameraAnalysis({ demoMode, onStateChange, enabled = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);   // offscreen analysis canvas
  const overlayRef = useRef(null);  // visible canvas used when demo mode distorts the feed

  const [camState, setCamState] = useState('idle'); // idle|requesting|live|denied|error|nocam
  const [camError, setCamError] = useState('');
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);
  const [facingMirror, setFacingMirror] = useState(true);

  const [scores, setScores] = useState(null);
  const [verdict, setVerdict] = useState({
    state: 'good',
    confidence: 0.8,
    reason: 'Waiting for camera…',
    streak: 0,
    required: THRESHOLDS.CONSECUTIVE_FRAMES,
    pending: null,
  });
  const [spark, setSpark] = useState({ blur: [], brightness: [] });
  const [fps, setFps] = useState(0);
  const [demoSubstituted, setDemoSubstituted] = useState(false);
  const [mlStatus, setMlStatus] = useState(getModelStatus());

  const stabilizer = useRef(new StateStabilizer());
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const lastRun = useRef(0);
  const fpsWin = useRef([]);
  const demoRef = useRef(demoMode);
  const changeRef = useRef(onStateChange);
  demoRef.current = demoMode;
  changeRef.current = onStateChange;

  const [cameraOn, setCameraOn] = useState(true);

  /* --------------------------- camera control --------------------------- */
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraOn((prev) => !prev);
  }, []);

  const start = useCallback(
    async (id) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamState('nocam');
        setCamError('This browser does not expose getUserMedia (needs HTTPS or localhost).');
        return;
      }
      setCamState('requesting');
      setCamError('');
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: id
            ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings?.() || {};
        setFacingMirror(settings.facingMode !== 'environment');
        setDeviceId(settings.deviceId || id || null);
        setCamState('live');

        // Labels are only populated after permission is granted.
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((d) => d.kind === 'videoinput'));
      } catch (err) {
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setCamState('denied');
          setCamError('Camera permission was blocked.');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setCamState('nocam');
          setCamError('No camera device found.');
        } else {
          setCamState('error');
          setCamError(err?.message || String(err));
        }
      }
    },
    [stopStream]
  );

  useEffect(() => {
    if (enabled && cameraOn) {
      start(deviceId);
    } else {
      stopStream();
      setCamState('off');
    }
    return () => {
      stopStream();
    };
  }, [enabled, cameraOn, start, stopStream, deviceId]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = ANALYSIS_W;
    canvas.height = ANALYSIS_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let cancelled = false;

    const loop = (ts) => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(loop);
      if (ts - lastRun.current < FRAME_INTERVAL) return;
      lastRun.current = ts;

      const video = videoRef.current;
      const demo = demoRef.current;
      const hasVideo = video && video.readyState >= 2 && video.videoWidth > 0;

      // Draw source into the analysis canvas (cover-fit, preserving aspect).
      if (hasVideo) {
        const vw = video.videoWidth, vh = video.videoHeight;
        const s = Math.max(ANALYSIS_W / vw, ANALYSIS_H / vh);
        const dw = vw * s, dh = vh * s;
        ctx.drawImage(video, (ANALYSIS_W - dw) / 2, (ANALYSIS_H - dh) / 2, dw, dh);
      } else if (demo && demo !== 'none') {
        // No camera, but Demo Mode still has to work (venue may block camera).
        // Synthesise a plausible "clean scene" for the effect to act upon.
        paintSyntheticScene(ctx, ts);
      } else {
        return;
      }

      // Demo effects are baked into the PIXELS the detector reads, so the
      // verdict is produced by the same code path as a physically dirty lens.
      let substituted = false;
      if (demo && demo !== 'none') {
        // A contamination diagnosis needs SCENE DETAIL to work on: you cannot
        // detect "part of the frame has been veiled" if there was nothing
        // there to veil. Some venues/webcams (and Chrome's synthetic test
        // feed) deliver an almost texture-free image, which would make the
        // safety-net buttons unreliable on stage. So we measure the base
        // frame's detail first and, if it is too flat to diagnose, substitute
        // a textured reference scene and say so in the UI. The DETECTION is
        // still entirely real — only the subject is standardised.
        if (hasVideo && lacksDetail(ctx)) {
          paintSyntheticScene(ctx, ts);
          substituted = true;
        }
        applyDemoEffect(ctx, ANALYSIS_W, ANALYSIS_H, demo, ts);
      }
      setDemoSubstituted(substituted);

      // Mirror the analysed pixels to the visible overlay canvas when demo
      // mode is active, so what the judge SEES is what the engine ANALYSED.
      const ov = overlayRef.current;
      if (ov && demo && demo !== 'none') {
        if (ov.width !== ANALYSIS_W) { ov.width = ANALYSIS_W; ov.height = ANALYSIS_H; }
        ov.getContext('2d').drawImage(canvas, 0, 0);
      }

      const t0 = performance.now();
      const s = analyzeFrame(ctx, ANALYSIS_W, ANALYSIS_H);
      let result = classifyFrame(s);
      result = blendWithModel(result, canvas); // Tier-2 hook (no-op if unloaded)

      const stable = stabilizer.current.push(result);
      if (stable.changed) changeRef.current?.(stable.state, stable.confidence, stable.reason);

      setScores(s);
      setVerdict({ ...stable, raw: result.state, rawConfidence: result.confidence });
      setSpark((p) => ({
        blur: [...p.blur, s.blurVariance].slice(-SPARK_LEN),
        brightness: [...p.brightness, s.brightnessMean].slice(-SPARK_LEN),
      }));
      setMlStatus(getModelStatus());

      const dt = performance.now() - t0;
      fpsWin.current.push(dt);
      if (fpsWin.current.length > 20) fpsWin.current.shift();
      setFps(fpsWin.current.reduce((a, b) => a + b, 0) / fpsWin.current.length);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current); };
  }, []);

  const retry = useCallback(() => start(deviceId), [start, deviceId]);
  const switchDevice = useCallback((id) => start(id), [start]);

  return {
    videoRef, canvasRef, overlayRef,
    camState, camError, devices, deviceId, switchDevice, retry,
    facingMirror, scores, verdict, spark, analysisMs: fps, mlStatus, demoSubstituted,
    cameraOn, toggleCamera,
  };
}

/**
 * Is this frame too featureless for a contamination diagnosis to be meaningful?
 * Uses the same Laplacian/edge measures as the main engine.
 */
function lacksDetail(ctx) {
  const img = ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);
  const { gray } = toGrayscale(img.data, ANALYSIS_W, ANALYSIS_H);
  const { variance, edgeDensity } = laplacianStats(gray, ANALYSIS_W, ANALYSIS_H);
  return variance < 240 || edgeDensity < 4;
}

/* --------------------------------------------------------------------------
 * Synthetic fallback scene — only used when there is no camera at all, so the
 * Demo Mode buttons still produce genuine detections for the judges.
 * Clearly a stand-in: soft gradients + a few objects + gentle drift.
 * ------------------------------------------------------------------------ */
function paintSyntheticScene(ctx, ts) {
  const t = ts / 1000;
  const g = ctx.createLinearGradient(0, 0, ANALYSIS_W, ANALYSIS_H);
  g.addColorStop(0, '#8fa3bf');
  g.addColorStop(0.5, '#b8c4d4');
  g.addColorStop(1, '#7c8ba3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ANALYSIS_W, ANALYSIS_H);

  ctx.fillStyle = 'rgba(40,48,62,0.85)';
  ctx.fillRect(96 + Math.sin(t * 0.6) * 4, 22, 34, 74);
  ctx.fillStyle = 'rgba(232,236,244,0.9)';
  ctx.fillRect(14, 58 + Math.cos(t * 0.5) * 3, 40, 54);
  ctx.fillStyle = 'rgba(60,70,88,0.7)';
  ctx.fillRect(0, 100, ANALYSIS_W, 3);
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = `rgba(${60 + i * 22},${70 + i * 16},${90 + i * 12},0.75)`;
    ctx.fillRect(8 + i * 21, 8 + (i % 3) * 5, 13, 11);
  }
  // Fine texture so the frame has honest high-frequency content to measure.
  const img = ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);
  const d = img.data;
  for (let y = 0; y < ANALYSIS_H; y++) {
    for (let x = 0; x < ANALYSIS_W; x++) {
      const p = (y * ANALYSIS_W + x) * 4;
      const n = 9 * Math.sin(x / 2.6 + y / 3.4) + 6 * Math.sin((x * y) / 90);
      d[p] += n; d[p + 1] += n; d[p + 2] += n;
    }
  }
  ctx.putImageData(img, 0, 0);
}
