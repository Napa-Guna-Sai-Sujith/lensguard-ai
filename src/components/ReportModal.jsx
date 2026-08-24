import { AnimatePresence, motion } from 'framer-motion';
import { STATES } from '../lib/classifyState.js';

/** Session report card — shows the product thinking beyond the demo. */
export default function ReportModal({ open, onClose, events, startedAt }) {
  const counts = events.reduce((a, e) => ({ ...a, [e.state]: (a[e.state] || 0) + 1 }), {});
  const total = events.length || 1;
  const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
  const issues = events.filter((e) => e.state !== 'good').length;
  const healthy = Math.round(((events.length - issues) / total) * 100);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ backgroundColor: 'var(--scrim)' }} onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="lg-card my-auto w-full max-w-lg p-6"
            style={{ boxShadow: 'var(--shadow-pop)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label="Session report"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">Camera Health Report</h2>
                <p className="mono text-[11.5px]" style={{ color: 'var(--txt2)' }}>
                  session · {mins} min · {events.length} events
                </p>
              </div>
              <button onClick={onClose} className="lg-btn px-3 py-1.5" aria-label="Close">✕</button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { k: 'Clear time', v: `${isFinite(healthy) ? healthy : 100}%`, c: 'var(--c-good)' },
                { k: 'Issues found', v: issues, c: 'var(--c-smudge)' },
                { k: 'Distinct types', v: Object.keys(counts).filter((k) => k !== 'good').length, c: 'var(--accent-ink)' },
              ].map((s) => (
                <div key={s.k} className="rounded-xl p-3" style={{ backgroundColor: 'var(--card-2)' }}>
                  <div className="mono text-xl font-bold" style={{ color: s.c }}>{s.v}</div>
                  <div className="text-[10.5px]" style={{ color: 'var(--txt2)' }}>{s.k}</div>
                </div>
              ))}
            </div>

            <h3 className="mb-2 mt-5 text-[13px] font-semibold">Detections by type</h3>
            <div className="space-y-1.5">
              {Object.keys(STATES).filter((k) => counts[k]).map((k) => {
                const st = STATES[k];
                const pct = (counts[k] / total) * 100;
                return (
                  <div key={k} className="flex items-center gap-2.5">
                    <span className="w-24 shrink-0 text-[12px]">{st.icon} {st.short}</span>
                    <div className="lg-track h-2 flex-1">
                      <div className="h-full rounded-full"
                           style={{ width: `${pct}%`, backgroundColor: `var(${st.colorVar})` }} />
                    </div>
                    <span className="mono w-7 shrink-0 text-right text-[11px]" style={{ color: 'var(--txt2)' }}>
                      {counts[k]}
                    </span>
                  </div>
                );
              })}
              {!events.length && (
                <p className="text-[12px]" style={{ color: 'var(--txt2)' }}>No events recorded yet.</p>
              )}
            </div>

            <div className="mt-5 rounded-xl p-3.5" style={{ backgroundColor: 'var(--card-2)' }}>
              <h3 className="mb-1 text-[12.5px] font-semibold">Recommendation</h3>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--txt2)' }}>
                {issues === 0
                  ? 'No lens issues detected this session. Camera is in good working order.'
                  : `${issues} capture issue${issues === 1 ? '' : 's'} detected. ` +
                    (counts.smudge || counts.dust
                      ? 'Wipe the lens with a dry microfibre cloth. '
                      : '') +
                    (counts.water ? 'Dry the lens fully before shooting. ' : '') +
                    (counts.blocked ? 'Check the case cut-out alignment. ' : '') +
                    'In production this rolls up into a monthly camera-health digest.'}
              </p>
            </div>

            <p className="mt-3 text-[10.5px]" style={{ color: 'var(--txt2)' }}>
              Generated entirely on-device. No frame, score, or event left this browser.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
