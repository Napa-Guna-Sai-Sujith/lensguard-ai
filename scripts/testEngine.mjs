/* ---------------------------------------------------------------------------
 * Synthetic-frame test harness for the Tier-1 engine (runs headless in Node).
 * The scene generator mimics NATURAL IMAGE STATISTICS (1/f spectrum + a few
 * hard object edges + sensor noise) rather than a checkerboard, so the
 * thresholds we calibrate here transfer to a real camera feed.
 * ------------------------------------------------------------------------ */
import { analyzeFrame, ANALYSIS_W as W, ANALYSIS_H as H } from '../src/lib/frameAnalysis.js';
import { classifyFrame, THRESHOLDS } from '../src/lib/classifyState.js';

const ctx = (data) => ({ getImageData: () => ({ data, width: W, height: H }) });
const mk = () => new Uint8ClampedArray(W * H * 4);
const set = (d, x, y, v) => { const p = (y*W+x)*4; const c = v<0?0:v>255?255:v; d[p]=d[p+1]=d[p+2]=c; d[p+3]=255; };
const get = (d, x, y) => d[(y*W+x)*4];

let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

/** Natural-ish scene: low-freq illumination + mid-freq texture + object edges + noise. */
function scene(bright = 128) {
  const d = mk();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = bright;
    v += 26 * Math.sin(x / 41 + 0.6) + 20 * Math.cos(y / 33);       // illumination
    v += 12 * Math.sin(x / 9.3) * Math.cos(y / 7.7);                 // texture
    v += 7 * Math.sin(x / 3.1 + y / 4.3);                            // fine detail
    set(d, x, y, v);
  }
  // Hard object edges (furniture / doorframe / hand) — the real source of edge energy
  for (let y = 20; y < 95; y++) for (let x = 96; x < 132; x++) set(d, x, y, get(d,x,y) * 0.42);
  for (let y = 60; y < 118; y++) for (let x = 12; x < 52; x++) set(d, x, y, get(d,x,y) * 1.38);
  for (let y = 8; y < 30; y++) for (let x = 40; x < 90; x++) set(d, x, y, get(d,x,y) * 0.68);
  for (let x = 0; x < W; x++) { const yy = 100 + Math.round(4*Math.sin(x/17)); for (let y=yy;y<yy+3;y++) set(d,x,y, 40); }
  for (let i = 0; i < W*H*4; i += 4) { const n = (rnd()-0.5)*5; d[i]=d[i+1]=d[i+2]=Math.max(0,Math.min(255,d[i]+n)); }
  return d;
}
function blurRegion(d, x0, y0, x1, y1, passes = 3) {
  for (let p = 0; p < passes; p++) {
    const src = d.slice();
    for (let y = Math.max(y0,1); y < Math.min(y1,H-1); y++)
      for (let x = Math.max(x0,1); x < Math.min(x1,W-1); x++) {
        let s=0; for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) s += src[((y+dy)*W+(x+dx))*4];
        set(d,x,y,s/9);
      }
  }
  return d;
}
const scale = (d,f) => { for (let i=0;i<d.length;i+=4){ const v=d[i]*f; d[i]=d[i+1]=d[i+2]=v<0?0:v>255?255:v; } return d; };

const cases = {};
cases.good = scene(128);
cases.blocked = (() => { const d=mk(); for(let y=0;y<H;y++)for(let x=0;x<W;x++) set(d,x,y, 5+rnd()*3); return d; })();
cases.lowlight = scale(scene(128), 0.20);
cases.blur = blurRegion(scene(128), 0, 0, W, H, 5);
cases.smudge = (() => {                       // veiled patch, rest sharp
  const d = scene(128);
  blurRegion(d, 6, 20, 82, 100, 6);
  for (let y=20;y<100;y++) for (let x=6;x<82;x++) {
    const fx = Math.min(1,(Math.min(x-6,82-x))/14), fy = Math.min(1,(Math.min(y-20,100-y))/14);
    const a = Math.min(fx,fy);                 // soft-edged halo, like real grease
    set(d,x,y, get(d,x,y)*(1-0.3*a) + 52*a);
  }
  return d;
})();
cases.water = (() => {
  const d = scene(120);
  for (const [cx,cy,r] of [[30,30,5],[62,44,6],[95,28,5],[112,72,6],[45,82,5],[78,96,6],[136,52,5]]) {
    blurRegion(d, cx-r-5, cy-r-5, cx+r+6, cy+r+6, 5);
    for (let y=cy-r;y<=cy+r;y++) for (let x=cx-r;x<=cx+r;x++)
      if (x>=0&&y>=0&&x<W&&y<H && (x-cx)**2+(y-cy)**2 <= r*r) set(d,x,y,250);
  }
  return d;
})();
cases.dust = (() => {
  const d = scene(150);
  for (let i=0;i<200;i++) {
    const cx = 3+Math.floor(rnd()*(W-6)), cy = 3+Math.floor(rnd()*(H-6));
    const r = rnd() < 0.5 ? 1 : 1.6;
    for (let y=cy-2;y<=cy+2;y++) for (let x=cx-2;x<=cx+2;x++)
      if ((x-cx)**2+(y-cy)**2 <= r*r) set(d,x,y, 14);
  }
  return d;
})();

console.log('exp'.padEnd(9),'got'.padEnd(11),'conf'.padEnd(6),'ms'.padEnd(5),'metrics');
console.log('-'.repeat(126));
let pass=0;
for (const [name,data] of Object.entries(cases)) {
  const s = analyzeFrame(ctx(data)); const r = classifyFrame(s);
  const ok = r.state===name; if(ok) pass++;
  console.log(name.padEnd(9),(ok?'✓ ':'✗ ')+r.state.padEnd(9),r.confidence.toFixed(2).padEnd(6),s.analysisMs.toFixed(1).padEnd(5),
    `lum=${s.brightnessMean.toFixed(0)} blur=${s.blurVariance.toFixed(0)} med=${s.medianCellBlur.toFixed(0)} spread=${s.sharpnessSpread.toFixed(1)} soft=${(s.softCellRatio*100).toFixed(0)}% blob=${s.brightBlobCount} drop=${s.dropletScore.toFixed(0)} speck=${s.speckDensity.toFixed(2)} block=${s.blockagePercent.toFixed(0)} edge=${s.edgeDensity.toFixed(2)} shad=${s.shadowRatio.toFixed(0)}`);
}
console.log('-'.repeat(126)); console.log(`${pass}/${Object.keys(cases).length} passed`);

/* --------------------------------------------------------------------------
 * NEGATIVE CASES — realistic frames that must NOT raise a false alarm.
 * These are the ones that embarrass you on stage.
 * ------------------------------------------------------------------------ */
const neg = {};
neg['blank wall']      = (() => { const d=mk(); for(let y=0;y<H;y++)for(let x=0;x<W;x++) set(d,x,y,150+6*Math.sin(x/50)+(rnd()-0.5)*4); return d; })();
neg['backlit window']  = (() => { const d=scene(105); for(let y=10;y<70;y++)for(let x=88;x<150;x++) set(d,x,y,252); return d; })();
neg['dim but fine']    = scale(scene(128), 0.62);
neg['bright sky']      = (() => { const d=mk(); for(let y=0;y<H;y++)for(let x=0;x<W;x++) set(d,x,y,225+(rnd()-0.5)*6); return d; })();
neg['high contrast']   = (() => { const d=scene(120); for(let y=0;y<H;y++)for(let x=0;x<W;x++) set(d,x,y,(get(d,x,y)-120)*2.1+120); return d; })();

console.log('\nNEGATIVE CASES (expect: good)');
console.log('-'.repeat(126));
let np = 0;
for (const [name, data] of Object.entries(neg)) {
  const s = analyzeFrame(ctx(data)); const r = classifyFrame(s);
  const ok = r.state === 'good'; if (ok) np++;
  console.log(name.padEnd(16), (ok?'✓ ':'✗ ')+r.state.padEnd(9), r.confidence.toFixed(2).padEnd(6),
    `lum=${s.brightnessMean.toFixed(0)} blur=${s.blurVariance.toFixed(0)} spread=${s.sharpnessSpread.toFixed(1)} soft=${(s.softCellRatio*100).toFixed(0)}% blob=${s.brightBlobCount} drop=${s.dropletScore.toFixed(0)} speck=${s.speckDensity.toFixed(2)} block=${s.blockagePercent.toFixed(0)} edge=${s.edgeDensity.toFixed(2)}`);
}
console.log('-'.repeat(126)); console.log(`${np}/${Object.keys(neg).length} negatives clean`);
