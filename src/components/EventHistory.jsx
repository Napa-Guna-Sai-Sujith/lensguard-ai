import { AnimatePresence, motion } from 'framer-motion';
import { STATES } from '../lib/classifyState.js';

/** Horizontal timeline of the last 10 state transitions. */
export default function EventHistory({ events, onExport }) {
  return (
    <div className="lg-card p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">Session Timeline</span>
          <span className="lg-chip">{events.length} event{events.length === 1 ? '' : 's'}</span>
        </div>
        <button onClick={onExport} className="lg-chip" style={{ color: 'var(--accent-ink)' }}>
          ⤓ Export report
        </button>
      </div>

      {events.length === 0 ? (
        <p className="py-3 text-[12px]" style={{ color: 'var(--txt2)' }}>
          No state changes yet — move something in front of the lens, or hit a Demo Mode button.
        </p>
      ) : (
        <div className="scrollbar-thin flex items-stretch gap-2 overflow-x-auto pb-1.5">
          <AnimatePresence initial={false}>
            {events.map((ev) => {
              const st = STATES[ev.state];
              const color = `var(${st.colorVar})`;
              return (
                <motion.div
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, x: 26, scale: 0.94 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  className="flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-2"
                  style={{ borderColor: color, backgroundColor: `var(${st.tintVar})` }}
                >
                  <span className="text-sm">{st.icon}</span>
                  <div className="leading-tight">
                    <div className="text-[11.5px] font-semibold" style={{ color }}>{st.short}</div>
                    <div className="mono text-[10px]" style={{ color: 'var(--txt2)' }}>{ev.time}</div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
