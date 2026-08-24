import { motion } from 'framer-motion';
import { STATES } from '../lib/classifyState.js';
import { GRID_COLS, GRID_ROWS } from '../lib/frameAnalysis.js';

/**
 * Live camera surface.
 *  - <video> is the real feed.
 *  - overlay <canvas> shows the DISTORTED pixels when Demo Mode is on, so the
 *    judge always sees exactly what the detector analysed.
 *  - optional heat grid visualises per-cell softness (the smudge discriminator).
 */
export default function CameraView({
  videoRef, overlayRef, camState, camError, onRetry,
  stateId, mirrored, demoMode, showGrid, scores, devices, deviceId, onDevice,
  demoSubstituted, cameraOn, onToggleCamera,
}) {
  const st = STATES[stateId] || STATES.good;
  const color = `var(${st.colorVar})`;
  const live = camState === 'live';
  const demoActive = demoMode && demoMode !== 'none';

  return (
    <div
      className="lg-card status-morph relative overflow-hidden"
      style={{
        borderColor: color,
        boxShadow: `0 0 0 1px ${color}, 0 0 34px -6px ${color}`,
        '--status-glow': color,
      }}
    >
      <div className="relative aspect-[4/3] w-full bg-black sm:aspect-video">
        {/* Real feed — hidden while a demo distortion is being rendered */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            transform: mirrored ? 'scaleX(-1)' : 'none',
            opacity: demoActive ? 0 : (cameraOn ? 1 : 0),
          }}
        />
        {/* Demo Mode: the analysed pixels, upscaled */}
        <canvas
          ref={overlayRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            transform: mirrored ? 'scaleX(-1)' : 'none',
            opacity: demoActive ? 1 : 0,
            imageRendering: 'auto',
          }}
        />

        {/* Per-cell softness heat grid */}
        {showGrid && scores?.gridCellScores?.length > 0 && (
          <div
            className="pointer-events-none absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${GRID_COLS},1fr)`,
              gridTemplateRows: `repeat(${GRID_ROWS},1fr)`,
              transform: mirrored ? 'scaleX(-1)' : 'none',
            }}
          >
            {scores.gridCellScores.map((c, i) => (
              <div
                key={i}
                className="border transition-colors duration-200"
                style={{
                  borderColor: 'rgba(255,255,255,.07)',
                  backgroundColor: c.soft ? 'rgba(252,205,3,.38)' : 'transparent',
                }}
              />
            ))}
          </div>
        )}

        {/* Framing reticle */}
        {live && cameraOn && (
          <div className="pointer-events-none absolute inset-0">
            {['left-3 top-3 border-l-2 border-t-2', 'right-3 top-3 border-r-2 border-t-2',
              'left-3 bottom-3 border-l-2 border-b-2', 'right-3 bottom-3 border-r-2 border-b-2']
              .map((cls) => (
                <div key={cls} className={`absolute h-6 w-6 rounded-[3px] ${cls}`}
                  style={{ borderColor: 'rgba(255,255,255,.5)' }} />
              ))}
          </div>
        )}

        {/* Status pill */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2 z-10">
          <motion.div
            layout
            className="status-morph flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md"
            style={{ backgroundColor: 'rgba(0,0,0,.5)', color: '#fff', boxShadow: `inset 0 0 0 1px ${color}` }}
          >
            <span className="h-1.5 w-1.5 rounded-full animate-pulseDot" style={{ backgroundColor: color }} />
            <span>{st.label}</span>
          </motion.div>
          {demoActive && (
            <div className="rounded-full px-2.5 py-1 text-[10px] font-bold sm:text-[11px]"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}>
              DEMO MODE<span className="hidden sm:inline"> — synthetic distortion</span>
            </div>
          )}
          {demoActive && demoSubstituted && (
            <div
              className="max-w-[15rem] rounded-full px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-md ring-1 ring-white/25 sm:text-[10.5px]"
              style={{ backgroundColor: 'rgba(0,0,0,.62)' }}
              title="The live frame had too little detail to veil, so a textured reference scene is used. Detection is unchanged."
            >
              <span className="sm:hidden">reference scene</span>
              <span className="hidden sm:inline">live frame too flat — using reference scene</span>
            </div>
          )}
        </div>

        {/* Top-right controls: Camera device picker & Camera Power Toggle Icon */}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {live && devices?.length > 1 && (
            <select
              value={deviceId || ''}
              onChange={(e) => onDevice(e.target.value)}
              aria-label="Select camera"
              className="max-w-[10rem] truncate rounded-lg border-0 bg-black/55 px-2 py-1.5 text-[11px] text-white backdrop-blur-md focus:outline-none focus:ring-1 focus:ring-white/40"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId} className="text-black">
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={onToggleCamera}
            title={cameraOn ? "Turn Camera Off" : "Turn Camera On"}
            aria-label={cameraOn ? "Turn Camera Off" : "Turn Camera On"}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-md transition-all hover:bg-black/80 hover:scale-105 active:scale-95 focus:outline-none focus:ring-1 focus:ring-white/40"
          >
            {cameraOn ? (
              /* Camera ON Icon */
              <svg className="h-4 w-4 fill-current text-emerald-400" viewBox="0 0 24 24">
                <path d="M4 4h3l2-2h6l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
              </svg>
            ) : (
              /* Camera OFF Icon */
              <svg className="h-4 w-4 fill-current text-rose-400" viewBox="0 0 24 24">
                <path d="M3.27 2L2 3.27l2.12 2.12A2 2 0 0 0 2 7v11a2 2 0 0 0 2 2h14.73l2 2L22 20.73 3.27 2zM4 8.27l4.5 4.5A3 3 0 0 0 12 16a2.99 2.99 0 0 0 2.23-1.02l2.5 2.5H4V8.27zM9.46 5l-2-2h9.08l2 2H20a2 2 0 0 1 2 2v9.73l-2-2V7h-3.27l-2-2H9.46z"/>
              </svg>
            )}
          </button>
        </div>

        {/* Permission / error / camera off states */}
        {!live && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
               style={{ backgroundColor: 'var(--card)' }}>
            {camState === 'off' || !cameraOn ? (
              <>
                <div className="text-3xl text-rose-400">📷</div>
                <h3 className="text-base font-semibold">Camera is Turned Off</h3>
                <p className="max-w-sm text-sm" style={{ color: 'var(--txt2)' }}>
                  Click the camera icon in the top right to turn the live video feed back on.
                </p>
                <button onClick={onToggleCamera} className="lg-btn-brand mt-1">
                  Turn Camera On
                </button>
              </>
            ) : camState === 'requesting' ? (
              <>
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-transparent"
                     style={{ borderTopColor: 'var(--accent)', borderRightColor: 'var(--accent)' }} />
                <p className="text-sm" style={{ color: 'var(--txt2)' }}>Requesting camera access…</p>
              </>
            ) : (
              <>
                <div className="text-3xl">{camState === 'denied' ? '🔒' : '📷'}</div>
                <h3 className="text-base font-semibold">
                  {camState === 'denied' ? 'Camera permission blocked' : 'Camera unavailable'}
                </h3>
                <p className="max-w-sm text-sm" style={{ color: 'var(--txt2)' }}>
                  {camError || 'No camera stream.'}{' '}
                  {camState === 'denied' && 'Allow access via the icon in your browser address bar, then retry.'}
                </p>
                <p className="max-w-sm text-xs" style={{ color: 'var(--txt2)' }}>
                  <strong>Demo Mode still works</strong> without a camera — the buttons below drive the
                  real detection pipeline on a synthetic scene.
                </p>
                <button onClick={onRetry} className="lg-btn-brand mt-1">
                  Retry camera
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
