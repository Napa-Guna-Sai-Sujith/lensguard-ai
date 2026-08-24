/* ============================================================================
 * Demo Mode — physically-motivated distortions applied IN PIXEL SPACE.
 *
 * WHY PIXELS AND NOT A CSS FILTER:
 * A CSS overlay would only change what the judge sees; the detector would
 * still be analysing a clean frame and we'd have to fake the verdict. Here we
 * mutate the actual ImageData the engine reads, so the SAME Tier-1 pipeline
 * that handles a physically dirty lens produces the verdict. The demo button
 * is a stand-in for the prop, never for the detection.
 *
 * Each effect models the real optics of its defect:
 *   smudge  — spatially-varying low-pass + veiling glare (lifted blacks)
 *   dust    — small dark opaque occluders on a sharp scene
 *   water   — round speculars + local refraction warp
 *   blocked — near-total opaque occlusion with slight edge light leak
 *   lowlight— exposure scaling + shadow crush + read noise
 *   blur    — uniform low-pass across the whole frame (defocus/motion)
 * ==========================================================================*/

/** Separable box blur over a sub-rectangle, weighted by a soft mask. */
function blurRect(data, w, h, x0, y0, x1, y1, radius, maskFn) {
  x0 = Math.max(1, x0 | 0); y0 = Math.max(1, y0 | 0);
  x1 = Math.min(w - 1, x1 | 0); y1 = Math.min(h - 1, y1 | 0);
  if (x1 <= x0 || y1 <= y0) return;

  const src = new Uint8ClampedArray(data);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const m = maskFn ? maskFn(x, y) : 1;
      if (m <= 0.001) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const p = (yy * w + xx) * 4;
          r += src[p]; g += src[p + 1]; b += src[p + 2]; n++;
        }
      }
      const p = (y * w + x) * 4;
      data[p]     = src[p]     * (1 - m) + (r / n) * m;
      data[p + 1] = src[p + 1] * (1 - m) + (g / n) * m;
      data[p + 2] = src[p + 2] * (1 - m) + (b / n) * m;
    }
  }
}

export function applyDemoEffect(ctx, w, h, effect, ts = 0) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const t = ts / 1000;

  switch (effect) {
    /* ---------------------------------------------------------------- */
    case 'smudge': {
      // Two overlapping greasy patches that drift slowly, like a real
      // fingerprint smear: strong local low-pass + veiling glare.
      const blobs = [
        { cx: w * 0.34 + Math.sin(t * 0.4) * 3, cy: h * 0.52, rx: w * 0.30, ry: h * 0.36 },
        { cx: w * 0.60, cy: h * 0.36 + Math.cos(t * 0.33) * 3, rx: w * 0.22, ry: h * 0.26 },
      ];
      const mask = (x, y) => {
        let m = 0;
        for (const b of blobs) {
          const dx = (x - b.cx) / b.rx, dy = (y - b.cy) / b.ry;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r < 1) m = Math.max(m, Math.min(1, (1 - r) * 1.9)); // soft halo edge
        }
        return m;
      };
      blurRect(d, w, h, 0, 0, w, h, 5, mask);
      // Veiling glare: grease scatters light, lifting blacks and cutting contrast.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const m = mask(x, y);
          if (m <= 0.001) continue;
          const p = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) {
            d[p + c] = d[p + c] * (1 - 0.42 * m) + 86 * m;
          }
        }
      }
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'dust': {
      // Deterministic PRNG so specks sit still instead of shimmering.
      let seed = 987654321;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      const count = 190;
      for (let i = 0; i < count; i++) {
        const cx = 4 + rnd() * (w - 8);
        const cy = 4 + rnd() * (h - 8);
        const r = 0.9 + rnd() * 1.5;
        const opacity = 0.75 + rnd() * 0.25;
        for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
          for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const dd = Math.hypot(x - cx, y - cy);
            if (dd > r) continue;
            const a = opacity * Math.min(1, (r - dd) * 1.6);
            const p = (y * w + x) * 4;
            for (let c = 0; c < 3; c++) d[p + c] *= 1 - a;
          }
        }
      }
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'water': {
      const drops = [];
      let seed = 24680;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      for (let i = 0; i < 9; i++) {
        drops.push({
          cx: 12 + rnd() * (w - 24),
          cy: 10 + rnd() * (h - 20),
          r: 4 + rnd() * 4.5,
        });
      }
      // 1. Refraction: warp + soften a ring around each droplet.
      for (const dr of drops) {
        blurRect(
          d, w, h,
          dr.cx - dr.r * 2.4, dr.cy - dr.r * 2.4,
          dr.cx + dr.r * 2.4, dr.cy + dr.r * 2.4,
          2,
          (x, y) => {
            const dd = Math.hypot(x - dr.cx, y - dr.cy);
            return dd < dr.r * 2.2 ? Math.min(1, (dr.r * 2.2 - dd) / (dr.r * 1.2)) : 0;
          }
        );
      }
      // 2. Specular highlight: the droplet acts as a tiny lens.
      for (const dr of drops) {
        for (let y = Math.floor(dr.cy - dr.r); y <= dr.cy + dr.r; y++) {
          for (let x = Math.floor(dr.cx - dr.r); x <= dr.cx + dr.r; x++) {
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const dd = Math.hypot(x - dr.cx, y - dr.cy);
            if (dd > dr.r) continue;
            const a = Math.min(1, (dr.r - dd) / (dr.r * 0.55));
            const p = (y * w + x) * 4;
            for (let c = 0; c < 3; c++) d[p + c] = d[p + c] * (1 - a) + 252 * a;
          }
        }
      }
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'blocked': {
      // Opaque occluder with a faint light leak at the frame edge, which is
      // what a finger or case flap actually looks like.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
          const leak = edge < 6 ? (6 - edge) * 1.6 : 0;
          const p = (y * w + x) * 4;
          d[p] = 4 + leak; d[p + 1] = 4 + leak; d[p + 2] = 6 + leak;
        }
      }
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'lowlight': {
      // Exposure scaling + shadow crush + sensor read noise (the noise is what
      // makes it read as "dark scene" rather than "blocked lens").
      let seed = 13579;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      for (let i = 0; i < d.length; i += 4) {
        const n = (rnd() - 0.5) * 7;
        d[i]     = d[i]     * 0.13 + n;
        d[i + 1] = d[i + 1] * 0.13 + n;
        d[i + 2] = d[i + 2] * 0.155 + n; // slight blue cast, like real low light
      }
      break;
    }

    /* ---------------------------------------------------------------- */
    case 'blur': {
      blurRect(d, w, h, 0, 0, w, h, 4, null); // uniform defocus
      break;
    }

    default:
      break;
  }

  ctx.putImageData(img, 0, 0);
}

export const DEMO_EFFECTS = [
  { id: 'smudge',   label: 'Smudge',    icon: '👆', expect: 'smudge' },
  { id: 'dust',     label: 'Dust',      icon: '🟤', expect: 'dust' },
  { id: 'water',    label: 'Water',     icon: '💧', expect: 'water' },
  { id: 'blocked',  label: 'Blockage',  icon: '🚫', expect: 'blocked' },
  { id: 'lowlight', label: 'Low Light', icon: '🌙', expect: 'lowlight' },
  { id: 'blur',     label: 'Blur',      icon: '🌫️', expect: 'blur' },
];
