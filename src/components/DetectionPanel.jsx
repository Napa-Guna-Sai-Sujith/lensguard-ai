import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { THRESHOLDS } from '../lib/classifyState.js';
import Sparkline from './Sparkline.jsx';

function Metric({ label, value, unit, pct, color, hint }) {
  return (
    <div title={hint}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11.5px]" style={{ color: 'var(--txt2)' }}>{label}</span>
        <span className="mono shrink-0 text-[11.5px] font-semibold tabular-nums" style={{ color: 'var(--txt)' }}>
          {value}<span style={{ color: 'var(--txt2)' }}>{unit}</span>
        </span>
      </div>
      <div className="lg-track mt-1 h-1.5 w-full">
        <motion.div className="h-full rounded-full"
          style={{ backgroundColor: color }}
          animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          transition={{ duration: 0.25 }} />
      </div>
    </div>
  );
}

/** Collapsible instrumentation panel — proves the verdict isn't a black box. */
export default function DetectionPanel({ scores, spark, showGrid, onToggleGrid }) {
  const [open, setOpen] = useState(true);
  const s = scores;

  return (
    <div className="lg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">Detection Breakdown</span>
          <span className="lg-chip">live</span>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}
                     style={{ color: 'var(--txt2)' }}>▾</motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="space-y-3 border-t px-4 pb-4 pt-3.5" style={{ borderColor: 'var(--line)' }}>
              {!s ? (
                <p className="py-4 text-center text-xs" style={{ color: 'var(--txt2)' }}>
                  Waiting for first analysed frame…
                </p>
              ) : (
                <>
                  <Metric label="Blur / focus (Laplacian var)" value={s.blurVariance.toFixed(0)} unit=""
                    pct={Math.min(100, (s.blurVariance / THRESHOLDS.SHARP_REFERENCE) * 100)}
                    color={s.blurVariance < THRESHOLDS.BLUR_THRESHOLD ? 'var(--c-blur)' : 'var(--c-good)'}
                    hint={`Higher = sharper. Blur threshold ${THRESHOLDS.BLUR_THRESHOLD}.`} />

                  <Metric label="Brightness (mean luma)" value={s.brightnessMean.toFixed(0)} unit="/255"
                    pct={(s.brightnessMean / 255) * 100}
                    color={s.brightnessMean < THRESHOLDS.LOW_LIGHT_THRESHOLD ? 'var(--c-lowlight)' : 'var(--c-good)'}
                    hint={`BT.601 luma. Low-light threshold ${THRESHOLDS.LOW_LIGHT_THRESHOLD}.`} />

                  <Metric label="Contamination localisation" value={s.sharpnessSpread.toFixed(1)} unit="×"
                    pct={Math.min(100, (s.sharpnessSpread / 12) * 100)}
                    color={s.sharpnessSpread >= THRESHOLDS.SMUDGE_SPREAD ? 'var(--c-smudge)' : 'var(--txt2)'}
                    hint="Median ÷ 15th-percentile cell acutance. High = part of frame veiled while rest is sharp." />

                  <Metric label="Soft cells (of 48)" value={(s.softCellRatio * 48).toFixed(0)} unit=""
                    pct={s.softCellRatio * 100}
                    color={s.softCellRatio > 0 ? 'var(--c-smudge)' : 'var(--txt2)'}
                    hint="Grid cells markedly softer than the median cell." />

                  <Metric label="Moisture likelihood" value={s.dropletScore.toFixed(0)} unit="/100"
                    pct={s.dropletScore}
                    color={s.dropletScore >= THRESHOLDS.MOISTURE_SCORE ? 'var(--c-water)' : 'var(--txt2)'}
                    hint={`${s.brightBlobCount} ring-confirmed circular speculars.`} />

                  <Metric label="Dust speck density" value={s.speckDensity.toFixed(2)} unit="%"
                    pct={Math.min(100, (s.speckDensity / 8) * 100)}
                    color={s.speckDensity >= THRESHOLDS.DUST_SPECK_DENSITY ? 'var(--c-dust)' : 'var(--txt2)'}
                    hint="Dark islands on a calm, lit background." />

                  <Metric label="Obstruction coverage" value={s.blockagePercent.toFixed(0)} unit="%"
                    pct={s.blockagePercent}
                    color={s.blockagePercent >= THRESHOLDS.BLOCKAGE_PERCENT ? 'var(--c-blocked)' : 'var(--txt2)'}
                    hint="Grid cells that are simultaneously dark AND featureless." />

                  <Metric label="Edge density" value={s.edgeDensity.toFixed(2)} unit="%"
                    pct={Math.min(100, s.edgeDensity * 4)} color="var(--accent-ink)"
                    hint="Share of pixels with strong Laplacian response." />

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Sparkline data={spark.blur} label="Blur" color="var(--accent-ink)" />
                    <Sparkline data={spark.brightness} label="Brightness" color="var(--c-smudge)" max={255} />
                  </div>

                  <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--line)' }}>
                    <label className="flex cursor-pointer items-center gap-2 text-[11.5px]" style={{ color: 'var(--txt2)' }}>
                      <input type="checkbox" checked={showGrid} onChange={onToggleGrid}
                             className="h-3.5 w-3.5 accent-[var(--accent)]" />
                      Overlay soft-cell heat grid
                    </label>
                    <span className="mono text-[10.5px]" style={{ color: 'var(--txt2)' }}>
                      {s.analysisMs.toFixed(1)} ms · 160×120
                    </span>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
