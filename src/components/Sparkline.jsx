/** Dependency-free SVG sparkline — ~5s of score history. */
export default function Sparkline({ data = [], label, color, max }) {
  const w = 130, h = 34;
  const pts = data.slice(-50);
  const hi = max ?? Math.max(1, ...pts);
  const step = pts.length > 1 ? w / (pts.length - 1) : w;

  const path = pts
    .map((v, i) => {
      const y = h - Math.max(0, Math.min(1, v / hi)) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const last = pts.length ? pts[pts.length - 1] : 0;

  return (
    <div className="rounded-xl px-2.5 py-2" style={{ backgroundColor: 'var(--card-2)' }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--txt2)' }}>{label}</span>
        <span className="mono text-[10px] font-semibold" style={{ color }}>{last.toFixed(0)}</span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-1">
        {pts.length > 1 && (
          <>
            <path d={`${path} L${w},${h} L0,${h} Z`} fill={color} opacity="0.13" />
            <path d={path} fill="none" stroke={color} strokeWidth="1.6"
                  strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
    </div>
  );
}
