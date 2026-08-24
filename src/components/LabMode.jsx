import { useRef, useState } from 'react';
import { analyzeFrame, ANALYSIS_W, ANALYSIS_H } from '../lib/frameAnalysis.js';
import { classifyFrame, STATES } from '../lib/classifyState.js';

/**
 * Lab Mode — conceptual dev-tool view.
 *
 * Demonstrates the phone + laptop architecture from the concept doc: the SAME
 * Tier-1 engine batch-analyses a folder of sample images offline, so thresholds
 * can be tuned against a labelled corpus before shipping to the device.
 * Everything runs locally — files are read via FileReader and never uploaded.
 */
export default function LabMode() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);

  const handleFiles = async (files) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setBusy(true);

    const canvas = canvasRef.current;
    canvas.width = ANALYSIS_W;
    canvas.height = ANALYSIS_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const out = [];

    for (const file of list) {
      try {
        const bmp = await createImageBitmap(file);
        const s = Math.max(ANALYSIS_W / bmp.width, ANALYSIS_H / bmp.height);
        const dw = bmp.width * s, dh = bmp.height * s;
        ctx.clearRect(0, 0, ANALYSIS_W, ANALYSIS_H);
        ctx.drawImage(bmp, (ANALYSIS_W - dw) / 2, (ANALYSIS_H - dh) / 2, dw, dh);
        bmp.close?.();

        const scores = analyzeFrame(ctx, ANALYSIS_W, ANALYSIS_H);
        const verdict = classifyFrame(scores);
        out.push({ name: file.name, scores, verdict, thumb: canvas.toDataURL('image/jpeg', 0.6) });
      } catch {
        out.push({ name: file.name, error: true });
      }
    }
    setRows(out);
    setBusy(false);
  };

  const exportCsv = () => {
    const head = 'file,verdict,confidence,brightness,blurVar,spread,softCells,dropletScore,speckDensity,blockagePct\n';
    const body = rows.filter((r) => !r.error).map((r) =>
      [r.name, r.verdict.state, r.verdict.confidence.toFixed(3),
       r.scores.brightnessMean.toFixed(1), r.scores.blurVariance.toFixed(1),
       r.scores.sharpnessSpread.toFixed(2), (r.scores.softCellRatio * 48).toFixed(0),
       r.scores.dropletScore.toFixed(1), r.scores.speckDensity.toFixed(2),
       r.scores.blockagePercent.toFixed(1)].join(',')
    ).join('\n');
    const url = URL.createObjectURL(new Blob([head + body], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'lensguard-lab-results.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const dist = rows.reduce((acc, r) => {
    if (r.error) return acc;
    acc[r.verdict.state] = (acc[r.verdict.state] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="lg-card p-5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">Lab Mode</h2>
          <span className="rounded-lg px-2 py-1 text-[11px] font-semibold mono"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}>conceptual · dev-tool view</span>
        </div>
        <p className="max-w-3xl text-[13px] leading-relaxed" style={{ color: 'var(--txt2)' }}>
          The phone runs detection live; the laptop tunes it. This view runs the{' '}
          <strong>identical Tier-1 engine</strong> over a folder of sample images so thresholds can be
          calibrated against a labelled corpus before they ship to the device — the phone + laptop
          workflow from the concept doc, without needing the Office Kit hardware. Images are read
          locally with <code className="mono">FileReader</code> and never leave the machine.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="lg-btn-brand inline-flex cursor-pointer items-center">
            📁 Choose sample images
            <input type="file" accept="image/*" multiple className="hidden"
                   onChange={(e) => handleFiles(e.target.files)} />
          </label>
          {rows.length > 0 && (
            <>
              <button onClick={exportCsv} className="lg-btn">⤓ Export CSV</button>
              <button onClick={() => setRows([])} className="lg-btn">Clear</button>
            </>
          )}
          {busy && <span className="text-[12px]" style={{ color: 'var(--txt2)' }}>Analysing…</span>}
        </div>

        {rows.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(dist).map(([k, v]) => (
              <span key={k} className="rounded-lg px-2.5 py-1 text-[11.5px] font-medium"
                    style={{ backgroundColor: `var(${STATES[k].tintVar})`, color: `var(${STATES[k].colorVar})` }}>
                {STATES[k].icon} {STATES[k].short}: {v}
              </span>
            ))}
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {rows.length > 0 && (
        <div className="lg-card overflow-x-auto p-1">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead>
              <tr style={{ color: 'var(--txt2)' }}>
                {['', 'File', 'Verdict', 'Conf', 'Luma', 'BlurVar', 'Spread', 'Soft', 'Drop', 'Speck', 'Block'].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-[10.5px] font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="px-2.5 py-1.5">
                    {r.thumb && <img src={r.thumb} alt="" className="h-9 w-12 rounded object-cover" />}
                  </td>
                  <td className="max-w-[170px] truncate px-2.5 py-1.5">{r.name}</td>
                  {r.error ? (
                    <td colSpan={9} className="px-2.5 py-1.5" style={{ color: 'var(--c-blocked)' }}>
                      could not decode
                    </td>
                  ) : (
                    <>
                      <td className="px-2.5 py-1.5">
                        <span className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                              style={{ backgroundColor: `var(${STATES[r.verdict.state].tintVar})`,
                                       color: `var(${STATES[r.verdict.state].colorVar})` }}>
                          {STATES[r.verdict.state].icon} {STATES[r.verdict.state].short}
                        </span>
                      </td>
                      <td className="mono px-2.5 py-1.5">{(r.verdict.confidence * 100).toFixed(0)}%</td>
                      <td className="mono px-2.5 py-1.5">{r.scores.brightnessMean.toFixed(0)}</td>
                      <td className="mono px-2.5 py-1.5">{r.scores.blurVariance.toFixed(0)}</td>
                      <td className="mono px-2.5 py-1.5">{r.scores.sharpnessSpread.toFixed(1)}×</td>
                      <td className="mono px-2.5 py-1.5">{(r.scores.softCellRatio * 48).toFixed(0)}</td>
                      <td className="mono px-2.5 py-1.5">{r.scores.dropletScore.toFixed(0)}</td>
                      <td className="mono px-2.5 py-1.5">{r.scores.speckDensity.toFixed(2)}</td>
                      <td className="mono px-2.5 py-1.5">{r.scores.blockagePercent.toFixed(0)}%</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
