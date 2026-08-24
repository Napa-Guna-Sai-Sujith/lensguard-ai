/* Verify each Demo Mode button produces its intended verdict through the REAL
   detection pipeline (no faked states). Uses the same synthetic base scene the
   app falls back to when no camera is available. */
import { analyzeFrame, ANALYSIS_W as W, ANALYSIS_H as H } from '../src/lib/frameAnalysis.js';
import { classifyFrame } from '../src/lib/classifyState.js';
import { applyDemoEffect, DEMO_EFFECTS } from '../src/lib/demoEffects.js';

// Minimal 2D-context shim backed by a plain pixel buffer.
function makeCtx() {
  const data = new Uint8ClampedArray(W * H * 4);
  return {
    data,
    getImageData: () => ({ data: new Uint8ClampedArray(data), width: W, height: H }),
    putImageData: (img) => { data.set(img.data); },
  };
}
const set = (d,x,y,v)=>{const p=(y*W+x)*4; const c=v<0?0:v>255?255:v; d[p]=d[p+1]=d[p+2]=c; d[p+3]=255;};
const get = (d,x,y)=>d[(y*W+x)*4];

// Mirror of paintSyntheticScene: gradient + objects + fine texture.
function baseScene(d) {
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
    const g = 143 + (x/W)*30 - (y/H)*22;
    set(d,x,y,g);
  }
  for (let y=22;y<96;y++) for (let x=96;x<130;x++) set(d,x,y,44);
  for (let y=58;y<112;y++) for (let x=14;x<54;x++) set(d,x,y,234);
  for (let x=0;x<W;x++) for (let y=100;y<103;y++) set(d,x,y,66);
  for (let i=0;i<7;i++) for (let y=8+(i%3)*5;y<19+(i%3)*5;y++) for (let x=8+i*21;x<21+i*21;x++) set(d,x,y,60+i*22);
  for (let y=0;y<H;y++) for (let x=0;x<W;x++)
    set(d,x,y, get(d,x,y) + 9*Math.sin(x/2.6+y/3.4) + 6*Math.sin((x*y)/90));
}

console.log('effect'.padEnd(10),'expected'.padEnd(10),'got'.padEnd(11),'conf'.padEnd(6),'metrics');
console.log('-'.repeat(120));
let pass=0;
// Baseline: untouched scene must read as good.
{
  const ctx = makeCtx(); baseScene(ctx.data);
  const s = analyzeFrame(ctx); const r = classifyFrame(s);
  const ok = r.state==='good'; if(ok) pass++;
  console.log('(none)'.padEnd(10),'good'.padEnd(10),(ok?'✓ ':'✗ ')+r.state.padEnd(9),r.confidence.toFixed(2).padEnd(6),
   `lum=${s.brightnessMean.toFixed(0)} blur=${s.blurVariance.toFixed(0)} spread=${s.sharpnessSpread.toFixed(1)}`);
}
for (const e of DEMO_EFFECTS) {
  const ctx = makeCtx(); baseScene(ctx.data);
  applyDemoEffect(ctx, W, H, e.id, 0);
  const s = analyzeFrame(ctx); const r = classifyFrame(s);
  const ok = r.state===e.expect; if(ok) pass++;
  console.log(e.id.padEnd(10), e.expect.padEnd(10), (ok?'✓ ':'✗ ')+r.state.padEnd(9), r.confidence.toFixed(2).padEnd(6),
    `lum=${s.brightnessMean.toFixed(0)} blur=${s.blurVariance.toFixed(0)} spread=${s.sharpnessSpread.toFixed(1)} soft=${(s.softCellRatio*100).toFixed(0)}% blob=${s.brightBlobCount} drop=${s.dropletScore.toFixed(0)} speck=${s.speckDensity.toFixed(2)} block=${s.blockagePercent.toFixed(0)} edge=${s.edgeDensity.toFixed(2)}`);
}
console.log('-'.repeat(120)); console.log(`${pass}/${DEMO_EFFECTS.length+1} demo paths correct`);
