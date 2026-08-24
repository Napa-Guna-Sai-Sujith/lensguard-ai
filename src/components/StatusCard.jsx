import { AnimatePresence, motion } from 'framer-motion';
import { STATES } from '../lib/classifyState.js';
import ConfidenceMeter from './ConfidenceMeter.jsx';

/** The verdict hero: big icon, headline, action message, confidence, evidence. */
export default function StatusCard({ verdict, mlStatus, analysisMs, cameraOn = true, camState }) {
  const isOff = !cameraOn || camState === 'off';
  const st = isOff ? {
    id: 'off',
    label: 'Camera Paused',
    icon: '🚫',
    colorVar: '--c-blocked',
    tintVar: '--tint-blocked',
    message: 'Camera stream turned off. Turn the camera back on to resume real-time lens health diagnostics.',
    reason: 'Video feed suspended by user toggle'
  } : (STATES[verdict.state] || STATES.good);

  const color = `var(${st.colorVar})`;
  const tint = `var(${st.tintVar})`;
  const settling = verdict.pending && verdict.pending !== verdict.state;

  return (
    <motion.div
      layout
      className="lg-card status-morph relative overflow-hidden p-5"
      style={{ borderColor: color, boxShadow: `0 0 0 1px ${color}, 0 10px 34px -18px ${color}` }}
    >
      <div className="status-morph absolute inset-0 pointer-events-none" style={{ backgroundColor: tint, opacity: 0.9 }} />
      <div className="relative">
        <div className="flex items-start gap-3.5">
          <AnimatePresence mode="wait">
            <motion.div
              key={st.id}
              initial={{ scale: 0.55, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.55, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className="status-morph flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[26px]"
              style={{ backgroundColor: 'var(--card)', boxShadow: `inset 0 0 0 2px ${color}` }}
            >
              {st.icon}
            </motion.div>
          </AnimatePresence>

          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.h2
                key={st.id}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="status-morph text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]"
                style={{ color }}
              >
                {st.label}
              </motion.h2>
            </AnimatePresence>
            <p className="mt-1 text-[13.5px] leading-snug" style={{ color: 'var(--txt2)' }}>
              {st.message}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <ConfidenceMeter value={verdict.confidence} color={color} />
        </div>

        {/* Evidence line — why the engine said this. Keeps it out of black-box territory. */}
        <div className="mt-3.5 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'var(--card-2)' }}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--txt2)' }}>
            Evidence
          </div>
          <p className="mono text-[11.5px] leading-relaxed" style={{ color: 'var(--txt)' }}>
            {verdict.reason}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="lg-chip">Tier-1 heuristics</span>
          <span className="lg-chip">{analysisMs ? `${analysisMs.toFixed(1)} ms/frame` : '—'}</span>
          {mlStatus?.status === 'ready' ? (
            <span className="lg-chip" style={{ color: mlStatus.agreement?.agrees ? 'var(--c-good)' : 'var(--c-smudge)' }}>
              {mlStatus.agreement?.agrees ? '✓ Verified by ML model' : '⚠ ML model differs'}
            </span>
          ) : (
            <span className="lg-chip" title="Tier-2 is optional; Tier-1 runs standalone offline.">
              Tier-2 model: not loaded
            </span>
          )}
          {settling && (
            <span className="lg-chip" style={{ color: 'var(--accent-ink)' }}>
              settling → {STATES[verdict.pending]?.short} ({verdict.streak}/{verdict.required})
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
