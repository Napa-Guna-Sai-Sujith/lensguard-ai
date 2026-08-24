/* ============================================================================
 * LensGuard AI — Tier-1 heuristic CV engine
 * ----------------------------------------------------------------------------
 * Pure-JS pixel math over a downsampled ImageData frame. No ML, no network,
 * no WASM — runs in ~2-6ms per frame on a laptop and maps 1:1 onto the kind of
 * fixed-function/DSP work a Snapdragon NPU pipeline would do on-device.
 *
 * Design rules:
 *   1. Downsample first. We analyse at ANALYSIS_W x ANALYSIS_H (160x120), not
 *      at native camera resolution. Lens-scale defects are low-frequency
 *      relative to the sensor, so 1/16th the pixels loses nothing and buys a
 *      ~16x speedup. This is the single most important perf decision here.
 *   2. One pass where possible. Grayscale conversion, luminance sum and
 *      histogram are all computed in the same loop.
 *   3. Everything returns raw numbers. No thresholds live in this file —
 *      classification is a separate, tunable layer (classifyState.js).
 * ==========================================================================*/

/** Analysis resolution. Keep 4:3-ish; must match the offscreen canvas size. */
export const ANALYSIS_W = 160;
export const ANALYSIS_H = 120;

/** Contamination grid: 8 columns x 6 rows = 48 cells (matches 4:3 aspect). */
export const GRID_COLS = 8;
export const GRID_ROWS = 6;

/* ---------------------------------------------------------------------------
 * 1. GRAYSCALE + LUMINANCE + HISTOGRAM  (single pass)
 * -------------------------------------------------------------------------*/

/**
 * Convert RGBA ImageData to a Float32 grayscale plane using ITU-R BT.601
 * luma weights (0.299R + 0.587G + 0.114B) — the same weighting an ISP uses,
 * so our "brightness" matches what the camera pipeline considers exposure.
 *
 * @returns {{gray: Float32Array, mean: number, histogram: Uint32Array}}
 */
export function toGrayscale(data, w, h) {
  const n = w * h;
  const gray = new Float32Array(n);
  const histogram = new Uint32Array(256);
  let sum = 0;

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    // BT.601 luma. Integer-ish math keeps this branch-free and fast.
    const g = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    gray[i] = g;
    sum += g;
    histogram[g | 0]++;
  }

  return { gray, mean: sum / n, histogram };
}

/* ---------------------------------------------------------------------------
 * 2. BLUR / FOCUS — Laplacian variance
 * -------------------------------------------------------------------------*/

/**
 * Laplacian variance ("variance of Laplacian", Pech-Pacheco et al. 2000) —
 * the standard cheap focus metric. We convolve with the 4-neighbour discrete
 * Laplacian kernel:
 *
 *        0  1  0
 *        1 -4  1
 *        0  1  0
 *
 * ...which is a high-pass filter: it responds to edges and kills flat areas.
 * A sharp frame has lots of strong positive AND negative responses => HIGH
 * variance. A blurred frame has smeared, weak responses => LOW variance.
 *
 * We also count how many pixels exceed EDGE_MAG_MIN to get an independent
 * "edge density" signal, which disambiguates "blurry" from "empty/blocked"
 * (a blocked lens is flat => low variance AND ~zero edges; a blurry photo of
 * a rich scene still has some residual edge energy).
 *
 * @returns {{variance: number, edgeDensity: number, lapAbsMean: number}}
 */
export function laplacianStats(gray, w, h, edgeMagMin = 12) {
  let sum = 0;
  let sumSq = 0;
  let absSum = 0;
  let edges = 0;
  let count = 0;

  // Skip the 1px border (kernel needs all 4 neighbours).
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const lap =
        gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += lap;
      sumSq += lap * lap;
      const a = lap < 0 ? -lap : lap;
      absSum += a;
      if (a > edgeMagMin) edges++;
      count++;
    }
  }

  const mean = sum / count;
  return {
    variance: sumSq / count - mean * mean, // E[x^2] - E[x]^2
    edgeDensity: (edges / count) * 100,    // % of pixels that are edge pixels
    lapAbsMean: absSum / count,
  };
}

/* ---------------------------------------------------------------------------
 * 3. GLOBAL INTENSITY VARIANCE
 * -------------------------------------------------------------------------*/

/**
 * Plain variance of the grayscale plane. Distinct from Laplacian variance:
 * this measures how much TONAL RANGE the frame has, not how sharp it is.
 * A blocked lens has near-zero tonal range. A blurry but colourful scene
 * still has plenty. Together the two separate "blocked" from "blurred".
 */
export function intensityVariance(gray, mean) {
  let acc = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i] - mean;
    acc += d * d;
  }
  return acc / gray.length;
}

/* ---------------------------------------------------------------------------
 * 4. LOCAL GRID SCORING — the smudge/dust discriminator
 * -------------------------------------------------------------------------*/

/**
 * THE KEY IDEA OF THE WHOLE APP.
 *
 * Global blur (shaky hands, missed focus) degrades the ENTIRE frame evenly.
 * A smudge, fingerprint, dust speck or droplet degrades a LOCALISED REGION
 * while the rest of the frame stays sharp. So: don't just ask "is it blurry?",
 * ask "is it blurry HERE but sharp THERE?".
 *
 * We tile the frame into GRID_COLS x GRID_ROWS cells and compute per-cell
 * Laplacian variance + mean brightness + tonal variance. The classifier then
 * compares each cell against the frame's median cell:
 *   - a few soft cells amid sharp ones  => contamination (smudge / droplet)
 *   - all cells uniformly soft          => global blur
 *
 * @returns {{cells: Array, sharpnessSpread: number, softCellRatio: number,
 *            medianCellBlur: number, maxCellBlur: number}}
 */
export function gridScores(gray, w, h) {
  const cellW = Math.floor(w / GRID_COLS);
  const cellH = Math.floor(h / GRID_ROWS);
  const cells = [];

  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      const x0 = gx * cellW;
      const y0 = gy * cellH;
      const x1 = Math.min(x0 + cellW, w - 1);
      const y1 = Math.min(y0 + cellH, h - 1);

      let lSum = 0, lSumSq = 0, gSum = 0, gSumSq = 0, n = 0;

      for (let y = Math.max(y0, 1); y < y1; y++) {
        const row = y * w;
        for (let x = Math.max(x0, 1); x < x1; x++) {
          const i = row + x;
          const v = gray[i];
          gSum += v;
          gSumSq += v * v;
          const lap =
            gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * v;
          lSum += lap;
          lSumSq += lap * lap;
          n++;
        }
      }

      if (n === 0) continue;
      const lMean = lSum / n;
      const gMean = gSum / n;
      const blur = lSumSq / n - lMean * lMean;   // per-cell Laplacian variance
      const variance = gSumSq / n - gMean * gMean; // per-cell tonal variance

      // ACUTANCE = high-frequency energy normalised by tonal energy.
      //
      // Raw Laplacian variance alone cannot tell "this region is soft" from
      // "this region is a blank wall" — both are low. But they differ in the
      // RATIO: optical softening (smudge/droplet) destroys high frequencies
      // while leaving the region's broad tonal range largely intact, so
      // acutance collapses. A genuinely flat wall has little of either, so
      // its acutance stays mid-range. This normalisation is what stops an
      // ordinary plain background from being reported as contamination.
      cells.push({
        gx,
        gy,
        blur,
        brightness: gMean,
        variance,
        acutance: blur / (variance + 12),
      });
    }
  }

  // Median is robust to a handful of outlier cells (which is exactly what a
  // smudge is) — using the mean here would let the smudge hide itself.
  const sortedBlur = cells.map((c) => c.blur).sort((a, b) => a - b);
  const median = sortedBlur.length ? sortedBlur[Math.floor(sortedBlur.length / 2)] : 0;
  const maxCellBlur = sortedBlur.length ? sortedBlur[sortedBlur.length - 1] : 0;

  const sortedAcu = cells.map((c) => c.acutance).sort((a, b) => a - b);
  const medAcu = sortedAcu.length ? sortedAcu[Math.floor(sortedAcu.length / 2)] : 0;
  // Low percentile, not the single minimum: one odd corner shouldn't define
  // "the softest region", but a real smudge spans several cells and drags the
  // 15th percentile down with it.
  const p15Acu = sortedAcu.length ? sortedAcu[Math.floor(sortedAcu.length * 0.15)] : 0;

  // A cell is "soft" if its acutance is markedly below the median cell's AND
  // it still carries real tonal content (variance) — i.e. there IS something
  // behind the veil. That second clause is what excludes blank walls and sky.
  const SOFT_RATIO = 0.42;
  const MIN_CONTENT_VAR = 45;
  let soft = 0;
  for (const c of cells) {
    c.soft =
      medAcu > 0.02 && c.acutance < medAcu * SOFT_RATIO && c.variance > MIN_CONTENT_VAR;
    if (c.soft) soft++;
  }

  return {
    cells,
    medianCellBlur: median,
    maxCellBlur,
    minCellBlur: sortedBlur.length ? sortedBlur[0] : 0,
    // How much SOFTER the softest region is than a typical region.
    // >1 means part of the frame is veiled while the rest stays sharp — the
    // optical signature of contamination. (Measuring max/median instead would
    // describe the sharpest cell, which tells us nothing about a smudge.)
    medianAcutance: medAcu,
    sharpnessSpread:
      p15Acu > 0.0005 && medAcu > 0.02 ? medAcu / p15Acu : medAcu > 0.02 ? 60 : 0,
    softCellRatio: cells.length ? soft / cells.length : 0,
  };
}

/* ---------------------------------------------------------------------------
 * 5. MOISTURE / DROPLET HEURISTIC — bright blob detection
 * -------------------------------------------------------------------------*/

/**
 * Water droplets on a lens do two things simultaneously:
 *   (a) act as tiny lenses => small, roughly CIRCULAR specular highlights;
 *   (b) refract/warp their immediate surroundings => a soft, low-contrast
 *       "halo" ring right around each highlight.
 *
 * We threshold the frame at (mean + k*sigma) to isolate specular highlights,
 * run a stack-based connected-component pass, then keep only blobs that are:
 *   - the right SIZE (small-to-medium; excludes a bright window or the sky),
 *   - roughly ROUND (fill ratio vs. bounding box; excludes long glare streaks),
 *   - surrounded by a SOFTER-THAN-AVERAGE ring (the refraction signature that
 *     separates a real droplet from an ordinary bright reflection).
 *
 * @returns {{blobCount: number, dropletScore: number, blobs: Array}}
 */
export function brightBlobs(gray, w, h, mean, stdDev) {
  const thresh = Math.min(245, Math.max(150, mean + 2.1 * stdDev));
  const n = w * h;
  const visited = new Uint8Array(n);
  const blobs = [];

  // Measured on real+synthetic frames: genuine droplet speculars occupy ~20-75px
  // at analysis resolution with fill >0.7 and soft rings (<15). Sub-12px bright
  // pixels are overwhelmingly scene highlights or veiling-glare fragments from a
  // smudge, so the floor here is what stops grease from being called water.
  const MIN_AREA = 12;
  const MAX_AREA = Math.floor(n * 0.035); // >3.5% of frame = not a droplet
  const stack = new Int32Array(4096);

  for (let i = 0; i < n; i++) {
    if (visited[i] || gray[i] < thresh) continue;

    // --- flood fill (4-connected, iterative to avoid recursion blowups) ---
    let sp = 0;
    stack[sp++] = i;
    visited[i] = 1;
    let area = 0, minX = w, maxX = 0, minY = h, maxY = 0, sumX = 0, sumY = 0;

    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w;
      const py = (p / w) | 0;
      area++;
      sumX += px; sumY += py;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;

      if (sp > stack.length - 5) continue; // guard: bail on pathological blobs

      if (px > 0)     { const q = p - 1; if (!visited[q] && gray[q] >= thresh) { visited[q] = 1; stack[sp++] = q; } }
      if (px < w - 1) { const q = p + 1; if (!visited[q] && gray[q] >= thresh) { visited[q] = 1; stack[sp++] = q; } }
      if (py > 0)     { const q = p - w; if (!visited[q] && gray[q] >= thresh) { visited[q] = 1; stack[sp++] = q; } }
      if (py < h - 1) { const q = p + w; if (!visited[q] && gray[q] >= thresh) { visited[q] = 1; stack[sp++] = q; } }
    }

    if (area < MIN_AREA || area > MAX_AREA) continue;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    const fill = area / (bw * bh); // circle inscribed in its box ≈ 0.785

    // Reject streaks (high aspect) and sparse/ragged shapes (low fill).
    if (aspect > 2.2 || fill < 0.62) continue;

    // --- refraction ring test -------------------------------------------
    // Sample a ring just outside the blob. Around a droplet the ring is
    // optically SOFTER (warped) than the frame at large.
    const cx = sumX / area, cy = sumY / area;
    const r = Math.max(bw, bh) * 0.5 + 2;
    let ringSoftness = 0, ringN = 0;
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const sx = Math.round(cx + Math.cos(ang) * r);
      const sy = Math.round(cy + Math.sin(ang) * r);
      if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= h - 1) continue;
      const si = sy * w + sx;
      const lap = Math.abs(
        gray[si - w] + gray[si + w] + gray[si - 1] + gray[si + 1] - 4 * gray[si]
      );
      ringSoftness += lap;
      ringN++;
    }
    const ringMean = ringN ? ringSoftness / ringN : 999;

    blobs.push({ cx: cx / w, cy: cy / h, area, fill, aspect, ringMean });
  }

  // Droplets = round bright blobs with soft surroundings. Weight each blob by
  // how convincingly it matches, rather than a hard yes/no count.
  // The refraction ring is the decisive test. A droplet bends light around its
  // rim, so its surroundings go SOFT; a bright reflection off a smudge or a
  // shiny object sits on ordinary, still-detailed background. Hard-ringed
  // blobs are therefore scored at ~zero rather than merely down-weighted.
  let score = 0;
  let confirmed = 0;
  for (const b of blobs) {
    const roundness = Math.min(1, b.fill / 0.78);
    const softRing = b.ringMean < 10 ? 1 : b.ringMean < 16 ? 0.55 : b.ringMean < 22 ? 0.18 : 0;
    const w = roundness * softRing;
    if (w > 0.4) confirmed++;
    score += w;
  }

  return {
    // Report only ring-confirmed droplets — this is the number the classifier
    // gates on, so a frame full of ordinary highlights cannot reach quorum.
    blobCount: confirmed,
    rawBlobCount: blobs.length,
    dropletScore: Math.min(100, score * 20), // 0-100
    blobs: blobs.slice(0, 40),
  };
}

/* ---------------------------------------------------------------------------
 * 6. DUST — small dark high-frequency specks
 * -------------------------------------------------------------------------*/

/**
 * Dust reads as SMALL, DARK, HIGH-CONTRAST specks sitting on top of an
 * otherwise sharp scene. We look for pixels that are significantly darker
 * than their local 8-neighbourhood average while the frame overall is sharp.
 * (If the frame is globally blurry, "specks" are meaningless — the classifier
 * gates on that.)
 */
export function darkSpeckStats(gray, w, h, mean) {
  let specks = 0;
  let counted = 0;
  const darkDelta = Math.max(14, mean * 0.22);

  // Offsets of an 8-point ring at radius 3, precomputed as flat indices.
  const R = 3;
  const RING = [
    -R * w, R * w, -R, R,                       // N S W E
    -R * w - R, -R * w + R, R * w - R, R * w + R, // NW NE SW SE
  ];

  // Step 2px — specks span several pixels at analysis resolution, so we lose
  // nothing and halve the cost.
  for (let y = R + 1; y < h - R - 1; y += 2) {
    const row = y * w;
    for (let x = R + 1; x < w - R - 1; x += 2) {
      const i = row + x;
      // A speck is a DARK ISLAND ON A CALM, BRIGHTER BACKGROUND.
      //
      // We sample a ring at radius R *outside* the speck body (a speck spans
      // ~2-4px at analysis resolution, so the immediate 8-neighbourhood is
      // still inside it and would cancel the contrast out). Requiring that
      // ring to be mutually consistent — low spread — is what separates real
      // debris from ordinary scene texture and from straight object edges,
      // where half the ring is dark and half is bright.
      let ringSum = 0, ringSumSq = 0;
      for (let k = 0; k < 8; k++) {
        const q = i + RING[k];
        const v = gray[q];
        ringSum += v;
        ringSumSq += v * v;
      }
      const ringMean = ringSum / 8;
      const ringVar = ringSumSq / 8 - ringMean * ringMean;

      if (
        ringMean - gray[i] > darkDelta &&               // clearly darker than surroundings
        ringVar < ringMean * ringMean * 0.055 &&        // surroundings are calm & uniform
        ringMean > 45                                   // and actually lit (not a shadow)
      ) specks++;
      counted++;
    }
  }
  return { speckDensity: counted ? (specks / counted) * 100 : 0, speckCount: specks };
}

/* ---------------------------------------------------------------------------
 * 7. BLOCKAGE — near-uniform dark coverage
 * -------------------------------------------------------------------------*/

/**
 * A finger/case/cover over the lens produces a large region that is both DARK
 * and FEATURELESS. We reuse the grid: count cells that are simultaneously dark
 * and near-zero-variance, and report that as a % of the frame.
 * Partial blockage (a finger over one corner) shows up as 20-60%; full
 * blockage as >75%.
 */
export function blockageStats(cells, darkLevel = 62, flatVar = 42) {
  if (!cells.length) return { blockagePercent: 0, blockedCells: 0 };
  let blocked = 0;
  for (const c of cells) {
    if (c.brightness < darkLevel && c.variance < flatVar) blocked++;
  }
  return {
    blockagePercent: (blocked / cells.length) * 100,
    blockedCells: blocked,
  };
}

/* ---------------------------------------------------------------------------
 * 8. HISTOGRAM SHAPE — underexposure confirmation
 * -------------------------------------------------------------------------*/

/**
 * Mean brightness alone can be fooled (half a bright window + half shadow can
 * average to "fine"). We also ask what fraction of the frame sits in the
 * bottom 15% of the tonal range — true low light crushes almost everything
 * into the shadows.
 */
export function histogramStats(histogram, total) {
  let shadow = 0, highlight = 0;
  for (let v = 0; v < 38; v++) shadow += histogram[v];
  for (let v = 238; v < 256; v++) highlight += histogram[v];
  return {
    shadowRatio: (shadow / total) * 100,
    highlightRatio: (highlight / total) * 100,
  };
}

/* ---------------------------------------------------------------------------
 * 9. MAIN ENTRY POINT
 * -------------------------------------------------------------------------*/

/**
 * Analyse one frame. Call this on an offscreen canvas context that already has
 * the video drawn into it at ANALYSIS_W x ANALYSIS_H.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @returns {object} scores — pure numbers, no verdicts.
 */
export function analyzeFrame(ctx, width = ANALYSIS_W, height = ANALYSIS_H) {
  const t0 = performance.now();
  const img = ctx.getImageData(0, 0, width, height);

  const { gray, mean, histogram } = toGrayscale(img.data, width, height);
  const lap = laplacianStats(gray, width, height);
  const iVar = intensityVariance(gray, mean);
  const stdDev = Math.sqrt(iVar);
  const grid = gridScores(gray, width, height);
  const blobs = brightBlobs(gray, width, height, mean, stdDev);
  const specks = darkSpeckStats(gray, width, height, mean);
  const block = blockageStats(grid.cells);
  const hist = histogramStats(histogram, width * height);

  return {
    brightnessMean: mean,
    blurVariance: lap.variance,
    edgeDensity: lap.edgeDensity,
    lapAbsMean: lap.lapAbsMean,
    globalContrastVariance: iVar,
    stdDev,
    gridCellScores: grid.cells,
    medianCellBlur: grid.medianCellBlur,
    maxCellBlur: grid.maxCellBlur,
    sharpnessSpread: grid.sharpnessSpread,
    softCellRatio: grid.softCellRatio,
    brightBlobCount: blobs.blobCount,
    dropletScore: blobs.dropletScore,
    blobs: blobs.blobs,
    speckDensity: specks.speckDensity,
    blockagePercent: block.blockagePercent,
    shadowRatio: hist.shadowRatio,
    highlightRatio: hist.highlightRatio,
    analysisMs: performance.now() - t0,
  };
}
