import { AnimatePresence, motion } from 'framer-motion';
import { THRESHOLDS } from '../lib/classifyState.js';

function Flow() {
  // Inline SVG architecture diagram — no external assets, works offline
  // and inside the sandboxed preview iframe.
  const box = (x, y, w, h, fill, stroke) => ({ x, y, width: w, height: h, rx: 10, fill, stroke, strokeWidth: 1.5 });
  return (
    <svg viewBox="0 0 720 210" className="w-full" role="img" aria-label="LensGuard AI architecture">
      <defs>
        <marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="3.2" orient="auto">
          <path d="M0,0 L7,3.2 L0,6.4 z" fill="var(--txt2)" />
        </marker>
      </defs>

      <rect {...box(8, 62, 118, 74, 'var(--card-2)', 'var(--line)')} />
      <text x="67" y="90" textAnchor="middle" fontSize="20">📱</text>
      <text x="67" y="111" textAnchor="middle" fontSize="11" fill="var(--txt)" fontWeight="600">Camera feed</text>
      <text x="67" y="125" textAnchor="middle" fontSize="9" fill="var(--txt2)">getUserMedia</text>

      <line x1="128" y1="99" x2="164" y2="99" stroke="var(--txt2)" strokeWidth="1.5" markerEnd="url(#ar)" />

      <rect {...box(166, 62, 118, 74, 'var(--card-2)', 'var(--line)')} />
      <text x="225" y="90" textAnchor="middle" fontSize="20">🖼️</text>
      <text x="225" y="111" textAnchor="middle" fontSize="11" fill="var(--txt)" fontWeight="600">Downsample</text>
      <text x="225" y="125" textAnchor="middle" fontSize="9" fill="var(--txt2)">canvas → 160×120</text>

      <line x1="286" y1="99" x2="322" y2="99" stroke="var(--txt2)" strokeWidth="1.5" markerEnd="url(#ar)" />

      {/* Two-tier inference block */}
      <rect {...box(324, 14, 196, 84, 'var(--accent-soft)', 'var(--accent-ink)')} />
      <text x="422" y="34" textAnchor="middle" fontSize="10" fill="var(--accent-ink)" fontWeight="700">TIER 1 — always on</text>
      <text x="422" y="51" textAnchor="middle" fontSize="10.5" fill="var(--txt)">Laplacian · luma · grid</text>
      <text x="422" y="66" textAnchor="middle" fontSize="10.5" fill="var(--txt)">acutance · blobs · specks</text>
      <text x="422" y="85" textAnchor="middle" fontSize="9.5" fill="var(--txt2)">pure JS · ~2 ms · offline</text>

      <rect {...box(324, 108, 196, 62, 'var(--card-2)', 'var(--line)')} strokeDasharray="4 3" />
      <text x="422" y="127" textAnchor="middle" fontSize="10" fill="var(--txt2)" fontWeight="700">TIER 2 — optional</text>
      <text x="422" y="143" textAnchor="middle" fontSize="10.5" fill="var(--txt)">TF.js / Teachable Machine</text>
      <text x="422" y="158" textAnchor="middle" fontSize="9.5" fill="var(--txt2)">blends confidence only</text>

      <line x1="522" y1="99" x2="558" y2="99" stroke="var(--txt2)" strokeWidth="1.5" markerEnd="url(#ar)" />

      <rect {...box(560, 62, 150, 74, 'var(--card-2)', 'var(--line)')} />
      <text x="635" y="88" textAnchor="middle" fontSize="18">🎯</text>
      <text x="635" y="108" textAnchor="middle" fontSize="11" fill="var(--txt)" fontWeight="600">Verdict + action</text>
      <text x="635" y="122" textAnchor="middle" fontSize="9" fill="var(--txt2)">hysteresis · 5 frames</text>

      <text x="360" y="196" fontSize="9.5" fill="var(--txt2)" textAnchor="middle">
        Every stage runs in the browser — no network, no upload. Frames never leave the device.
      </text>
    </svg>
  );
}

export default function AboutModal({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ backgroundColor: 'var(--scrim)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="lg-card my-auto w-full max-w-3xl p-6"
            style={{ boxShadow: 'var(--shadow-pop)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label="About LensGuard AI"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">How LensGuard AI works</h2>
                <p className="text-[13px]" style={{ color: 'var(--txt2)' }}>
                  On-device camera health monitoring — two-tier inference, fully offline.
                </p>
              </div>
              <button onClick={onClose} className="lg-btn px-3 py-1.5" aria-label="Close">✕</button>
            </div>

            <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--line)', backgroundColor: 'var(--card)' }}>
              <Flow />
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <section>
                <h3 className="mb-1.5 text-[13px] font-semibold">Why it's fast</h3>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--txt2)' }}>
                  We analyse a <strong>160×120</strong> downsample, not the full sensor frame. Lens
                  defects are low-frequency relative to the sensor, so 1/16th of the pixels loses no
                  diagnostic signal but buys a ~16× speedup. The whole Tier-1 pass is{' '}
                  <strong>~2 ms</strong>, throttled to 10 fps, leaving the video itself at native
                  frame rate.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 text-[13px] font-semibold">Why it's phone-realistic</h3>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--txt2)' }}>
                  Every operation — luma conversion, Laplacian convolution, connected components — is a
                  fixed-function primitive that maps directly onto a Snapdragon DSP/NPU pipeline.
                  Nothing here needs a GPU or a server. On an iQOO device this becomes a always-on
                  pre-capture check costing near-zero battery.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 text-[13px] font-semibold">The key discriminator</h3>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--txt2)' }}>
                  A shaky hand blurs the <em>whole</em> frame; a smudge veils <em>part</em> of it. We
                  tile the frame into 8×6 cells and compare each cell's <strong>acutance</strong>
                  {' '}(high-frequency energy ÷ tonal energy) against the median cell. Softness that
                  coexists with sharp regions ⇒ contamination. Uniform softness ⇒ motion/focus blur.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 text-[13px] font-semibold">Tier 2 is optional by design</h3>
                <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--txt2)' }}>
                  A Teachable Machine classifier can be dropped into <code className="mono">public/model/</code>{' '}
                  to blend confidence and show a "Verified by ML" badge. It can only reinforce or
                  soften Tier-1 — never override it. If it's missing, offline, or throws, the app is
                  unaffected. That's what makes the Red Light phase a non-event.
                </p>
              </section>
            </div>

            <div className="mt-5 rounded-xl border-l-4 p-3.5"
                 style={{ borderColor: 'var(--c-smudge)', backgroundColor: 'var(--t-smudge)' }}>
              <h3 className="mb-1 text-[13px] font-semibold" style={{ color: 'var(--c-smudge)' }}>
                Deliberate scope limitation
              </h3>
              <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--txt)' }}>
                LensGuard does <strong>not</strong> diagnose physical hardware damage — cracked
                elements, sensor defects, failed OIS. Those require reference targets and calibration
                data a live preview cannot provide, and guessing at them would produce confident
                nonsense. We detect the everyday, <strong>fixable</strong> reasons a photo comes out
                bad, in the moment, while you can still fix them.
              </p>
            </div>

            <div className="mt-4">
              <h3 className="mb-2 text-[13px] font-semibold">Calibration constants</h3>
              <div className="mono grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl p-3 text-[11px] sm:grid-cols-3"
                   style={{ backgroundColor: 'var(--card-2)', color: 'var(--txt2)' }}>
                {Object.entries(THRESHOLDS).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="truncate">{k}</span>
                    <span style={{ color: 'var(--txt)' }}>{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11.5px]" style={{ color: 'var(--txt2)' }}>
                All thresholds are named constants in{' '}
                <code className="mono">src/lib/classifyState.js</code> — tunable during rehearsal
                without touching a line of logic.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {['React + Vite', 'TailwindCSS', 'Framer Motion', 'Canvas 2D', 'Pure-JS CV', 'TF.js (optional)', '100% client-side']
                .map((t) => <span key={t} className="lg-chip">{t}</span>)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
