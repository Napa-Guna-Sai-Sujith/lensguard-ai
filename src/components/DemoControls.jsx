import { DEMO_EFFECTS } from '../lib/demoEffects.js';
import { STATES } from '../lib/classifyState.js';

/**
 * Judge-safety net. Each button injects a physically-modelled distortion into
 * the pixel buffer the detector reads — so the verdict is produced by the real
 * pipeline, not hard-coded. Labelled explicitly so nobody thinks it's faked.
 */
export default function DemoControls({ active, onSelect, soundOn, onToggleSound }) {
  return (
    <div className="lg-card p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">Demo Mode</span>
          <span className="rounded-lg px-2 py-1 text-[11px] font-semibold mono"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}>synthetic</span>
        </div>
        <button
          onClick={onToggleSound}
          className="lg-chip"
          aria-pressed={soundOn}
          title={soundOn ? 'Mute state-change cue' : 'Unmute state-change cue'}
        >
          {soundOn ? '🔊 cue on' : '🔇 cue off'}
        </button>
      </div>
      <p className="mb-3 text-[11.5px] leading-snug" style={{ color: 'var(--txt2)' }}>
        Distortions are applied to the <strong>actual pixels</strong> the engine analyses — the
        verdict below is produced by the same detection path as a physically dirty lens.
        Works even without camera permission.
      </p>

      <div className="grid grid-cols-3 gap-2">
        {DEMO_EFFECTS.map((e) => {
          const on = active === e.id;
          const color = `var(${STATES[e.expect].colorVar})`;
          return (
            <button
              key={e.id}
              onClick={() => onSelect(on ? 'none' : e.id)}
              aria-pressed={on}
              className="flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-medium transition-all"
              style={{
                borderColor: on ? color : 'var(--line)',
                backgroundColor: on ? `var(${STATES[e.expect].tintVar})` : 'var(--card)',
                color: on ? color : 'var(--txt)',
                minHeight: 58,
              }}
            >
              <span className="text-base leading-none">{e.icon}</span>
              <span className="leading-tight">{e.label}</span>
            </button>
          );
        })}
      </div>

      {active && active !== 'none' && (
        <button
          onClick={() => onSelect('none')}
          className="lg-btn-brand mt-2.5 w-full"
        >
          ⟲ Clear distortion — back to live lens
        </button>
      )}
    </div>
  );
}
