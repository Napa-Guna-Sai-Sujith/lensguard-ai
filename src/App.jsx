import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from './lib/useTheme.js';
import { useCameraAnalysis } from './lib/useCameraAnalysis.js';
import { STATES } from './lib/classifyState.js';
import CameraView from './components/CameraView.jsx';
import StatusCard from './components/StatusCard.jsx';
import DetectionPanel from './components/DetectionPanel.jsx';
import DemoControls from './components/DemoControls.jsx';
import EventHistory from './components/EventHistory.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import AboutModal from './components/AboutModal.jsx';
import ReportModal from './components/ReportModal.jsx';
import LabMode from './components/LabMode.jsx';
import AuthModal from './components/AuthModal.jsx';
import AuthPage from './components/AuthPage.jsx';

const MAX_EVENTS = 10;

/** Short WebAudio blip on state change — no asset, mutable. */
function useCue(enabled) {
  const ctxRef = useRef(null);
  return useCallback(
    (stateId) => {
      if (!enabled) return;
      try {
        ctxRef.current ||= new (window.AudioContext || window.webkitAudioContext)();
        const ac = ctxRef.current;
        if (ac.state === 'suspended') ac.resume();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = stateId === 'good' ? 660 : 392;
        gain.gain.setValueAtTime(0.0001, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.09, ac.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.22);
        osc.connect(gain).connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + 0.24);
      } catch { /* audio unavailable — non-critical */ }
    },
    [enabled]
  );
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState('monitor');
  const [demoMode, setDemoMode] = useState('none');
  const [events, setEvents] = useState([]);
  const [showGrid, setShowGrid] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('lensguard_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [soundOn, setSoundOn] = useState(false);
  const startedAt = useRef(Date.now());

  const cue = useCue(soundOn);

  const onStateChange = useCallback(
    (stateId) => {
      cue(stateId);
      setEvents((prev) => [
        ...prev.slice(-(MAX_EVENTS - 1)),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          state: stateId,
          time: new Date().toLocaleTimeString('en-GB'),
          ts: Date.now(),
        },
      ]);
    },
    [cue]
  );

  const {
    videoRef, canvasRef, overlayRef, camState, camError, devices, deviceId,
    switchDevice, retry, facingMirror, scores, verdict, spark, analysisMs, mlStatus,
    demoSubstituted, cameraOn, toggleCamera,
  } = useCameraAnalysis({ demoMode, onStateChange, enabled: !!user });

  // Keyboard shortcuts for a smooth stage demo.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches?.('input,select,textarea')) return;
      const map = { 1: 'smudge', 2: 'dust', 3: 'water', 4: 'blocked', 5: 'lowlight', 6: 'blur', 0: 'none' };
      if (map[e.key] !== undefined) setDemoMode(map[e.key]);
      if (e.key.toLowerCase() === 't') toggle();
      if (e.key.toLowerCase() === 'g') setShowGrid((g) => !g);
      if (e.key === '?') setAboutOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Mandatory Login Gate: user must log in before accessing the main dashboard
  if (!user) {
    return <AuthPage onAuthSuccess={(u) => setUser(u)} />;
  }

  const st = STATES[verdict.state] || STATES.good;

  return (
    // Yellow brand field; the app itself floats on it as a white shell,
    // mirroring the reference design.
    <div className="min-h-full sm:p-6 lg:p-9" style={{ backgroundColor: 'var(--field)' }}>
     <div className="mx-auto min-h-full max-w-[1440px] app-shell sm:rounded-[28px] sm:overflow-hidden">
      {/* ---------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b backdrop-blur-xl themed"
              style={{ borderColor: 'var(--line)', backgroundColor: 'color-mix(in srgb, var(--bg) 82%, transparent)' }}>
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
               style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}>
            👁️
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-bold leading-tight sm:text-base">LensGuard AI</h1>
            <p className="hidden truncate text-[11.5px] sm:block" style={{ color: 'var(--txt2)' }}>
              On-device camera health monitor
            </p>
          </div>

          <nav className="flex rounded-xl border p-0.5 themed" style={{ borderColor: 'var(--line)' }}>
            {[['monitor', 'Monitor'], ['lab', 'Lab']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className="relative rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors sm:px-3"
                style={{ color: tab === id ? 'var(--pill-txt)' : 'var(--txt2)' }}>
                {tab === id && (
                  <motion.span layoutId="tabpill" className="absolute inset-0 rounded-lg"
                    style={{ backgroundColor: 'var(--pill)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
                )}
                <span className="relative">
                  {label}
                  {id === 'lab' && <span className="hidden sm:inline"> Mode</span>}
                </span>
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 md:flex"
               style={{ backgroundColor: 'var(--card-2)' }}>
            <span className="h-1.5 w-1.5 rounded-full animate-pulseDot"
                  style={{ backgroundColor: camState === 'live' ? 'var(--c-good)' : 'var(--c-blocked)' }} />
            <span className="mono text-[10.5px] font-semibold" style={{ color: 'var(--txt2)' }}>
              {camState === 'live' ? 'LIVE' : camState.toUpperCase()}
            </span>
          </div>

          <ThemeToggle theme={theme} onToggle={toggle} />

          {/* User Auth Profile / Login Button */}
          {user ? (
            <div className="flex items-center gap-2 border-l pl-3" style={{ borderColor: 'var(--line)' }}>
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="h-7 w-7 rounded-full object-cover ring-1 ring-white/20" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                     style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}>
                  {user.name?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <span className="hidden text-xs font-semibold sm:inline">{user.name}</span>
              <button
                onClick={() => {
                  localStorage.removeItem('lensguard_token');
                  localStorage.removeItem('lensguard_user');
                  setUser(null);
                }}
                title="Sign Out"
                className="text-[11px] font-medium opacity-70 hover:opacity-100 underline"
              >
                Exit
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      <main className="mx-auto max-w-[1400px] px-3 py-3 sm:px-4 sm:py-4 pb-10">
        {tab === 'lab' ? (
          <LabMode />
        ) : (
          <div className="space-y-4">
            <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-5">
              {/* Order & responsive layout:
                    Mobile (<768px): Camera -> Status & Controls -> Timeline
                    Tablet (768px-1024px): 2-column balanced grid
                    PC (1024px+): Verdict/Control sidebar on left (2 cols), Camera + Timeline on right (3 cols) */}
              <div className="order-1 md:order-1 md:col-span-2 lg:order-none lg:col-span-3 lg:col-start-3 lg:row-start-1">
                <CameraView
                  videoRef={videoRef} overlayRef={overlayRef}
                  camState={camState} camError={camError} onRetry={retry}
                  stateId={verdict.state} mirrored={facingMirror}
                  demoMode={demoMode} showGrid={showGrid} scores={scores}
                  devices={devices} deviceId={deviceId} onDevice={switchDevice}
                  demoSubstituted={demoSubstituted}
                  cameraOn={cameraOn} onToggleCamera={toggleCamera}
                />
                <p className="mt-2 px-1 text-[11px] leading-snug" style={{ color: 'var(--txt2)' }}>
                  Scope: detects <strong>fixable</strong> capture problems only — not physical hardware
                  damage.{' '}
                  <button onClick={() => setAboutOpen(true)} className="font-medium underline underline-offset-2"
                          style={{ color: 'var(--accent-ink)' }}>
                    Why?
                  </button>
                  <span className="hidden sm:inline">
                    {'  ·  '}
                    <span className="mono">keys 1-6 demo · 0 clear · T theme · G grid</span>
                  </span>
                </p>
              </div>

              <div className="order-2 space-y-4 md:order-2 md:col-span-1 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
                <StatusCard verdict={verdict} mlStatus={mlStatus} analysisMs={analysisMs} />
                <DetectionPanel scores={scores} spark={spark} showGrid={showGrid}
                                onToggleGrid={() => setShowGrid((g) => !g)} />
                <DemoControls active={demoMode} onSelect={setDemoMode}
                              soundOn={soundOn} onToggleSound={() => setSoundOn((s) => !s)} />
              </div>

              <div className="order-3 md:order-3 md:col-span-1 lg:order-none lg:col-span-3 lg:col-start-3 lg:row-start-2">
                <EventHistory events={events} onExport={() => setReportOpen(true)} />
              </div>
            </div>
          </div>
        )}

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[11.5px]"
                style={{ borderColor: 'var(--line)', color: 'var(--txt2)' }}>
          <span>
            LensGuard AI · Tier-1 heuristic CV engine · runs 100% client-side, no network required
          </span>
          <button onClick={() => setAboutOpen(true)} className="underline underline-offset-2 font-medium"
                  style={{ color: 'var(--accent-ink)' }}>
            About / How it works
          </button>
        </footer>
      </main>

      {/* Offscreen analysis canvas — the surface the engine actually reads. */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)}
                   events={events} startedAt={startedAt.current} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)}
                 onAuthSuccess={(u) => setUser(u)} />
     </div>
    </div>
  );
}
