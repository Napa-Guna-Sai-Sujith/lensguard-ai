import { motion } from 'framer-motion';

/** Slim animated confidence bar with tick marks. */
export default function ConfidenceMeter({ value = 0, color = 'var(--accent)', label = 'Confidence' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--txt2)' }}>
          {label}
        </span>
        <span className="mono text-sm font-semibold tabular-nums" style={{ color }}>
          {pct}%
        </span>
      </div>
      <div className="lg-track relative h-2.5 w-full">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}99, ${color})` }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 170, damping: 26 }}
        />
        {[25, 50, 75].map((t) => (
          <div key={t} className="absolute top-0 h-full w-px"
               style={{ left: `${t}%`, backgroundColor: 'var(--card)', opacity: 0.55 }} />
        ))}
      </div>
    </div>
  );
}
