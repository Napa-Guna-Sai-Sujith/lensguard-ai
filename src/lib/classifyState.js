/* ============================================================================
 * LensGuard AI — Tier-1 rules layer
 * ----------------------------------------------------------------------------
 * Turns the raw numbers from frameAnalysis.js into one of 7 verdicts, with a
 * confidence value and a human-readable "why".
 *
 * SCOPE (stated deliberately, also surfaced in the UI):
 *   We diagnose observable, FIXABLE, in-the-moment capture problems only.
 *   We do NOT attempt to diagnose physical hardware damage (cracked element,
 *   dead sensor, failed OIS) — that needs reference targets and calibration
 *   data a live preview simply cannot provide.
 *
 * CALIBRATION: every threshold is a named constant below. Tune these live
 * during rehearsal without touching a line of logic.
 * ==========================================================================*/

/* ------------------------- TUNABLE THRESHOLDS ---------------------------- */
export const THRESHOLDS = {
  // --- Focus / blur (Laplacian variance @160x120) ---
  BLUR_THRESHOLD: 40,          // below this the whole frame reads as soft
  SHARP_REFERENCE: 260,        // "definitely sharp" anchor, used for confidence
  BLUR_MIN_CONTENT_VAR: 140,   // need this much tonal range to judge focus at all

  // --- Exposure ---
  LOW_LIGHT_THRESHOLD: 60,     // mean luma 0-255
  LOW_LIGHT_SHADOW_RATIO: 55,  // % of pixels in the bottom tonal band
  DARK_FLOOR: 26,              // below this it's basically black

  // --- Blockage ---
  BLOCKAGE_PERCENT: 72,        // % of grid cells dark AND flat
  BLOCKAGE_VARIANCE: 90,       // global intensity variance ceiling
  BLOCKAGE_EDGE_DENSITY: 2.2,  // % edge pixels ceiling

  // --- Localised contamination (smudge) ---
  SMUDGE_SOFT_CELL_MIN: 0.10,  // ≥10% of cells markedly softer than median
  SMUDGE_SOFT_CELL_MAX: 0.72,  // >72% soft = it's global blur, not a smudge
  SMUDGE_SPREAD: 3.8,          // medianAcutance / p15Acutance ratio
  SMUDGE_MIN_GLOBAL_BLUR: 18,  // frame must retain *some* sharpness somewhere
  SMUDGE_MIN_SHARP_CELLS: 0.22,// ≥22% of cells must still be genuinely sharp
  SHARP_CELL_ACUTANCE: 0.15,   // absolute acutance marking a cell as "in focus"

  // --- Dust ---
  DUST_SPECK_DENSITY: 2.6,     // % of sampled pixels that are dark specks
  DUST_MIN_SHARPNESS: 55,      // dust only meaningful on a sharp-ish frame

  // --- Moisture ---
  MOISTURE_SCORE: 34,          // weighted droplet score 0-100
  MOISTURE_MIN_BLOBS: 3,        // ring-confirmed droplets required

  // --- Hysteresis ---
  CONSECUTIVE_FRAMES: 5,       // matching frames required before switching
};

/* --------------------------- STATE DEFINITIONS --------------------------- */
export const STATES = {
  good: {
    id: 'good',
    label: 'Camera is Clear',
    icon: '✅',
    emoji: '🟢',
    message: 'Camera is clear. Ready to shoot.',
    colorVar: '--c-good',
    tintVar: '--t-good',
    short: 'Clear',
  },
  smudge: {
    id: 'smudge',
    label: 'Lens Smudge',
    icon: '👆',
    emoji: '🟠',
    message: 'Lens contamination detected — clean the lens and try again.',
    colorVar: '--c-smudge',
    tintVar: '--t-smudge',
    short: 'Smudge',
  },
  dust: {
    id: 'dust',
    label: 'Dust / Debris',
    icon: '🟤',
    emoji: '🟤',
    message: 'Dust particles detected on lens — wipe gently with a dry cloth.',
    colorVar: '--c-dust',
    tintVar: '--t-dust',
    short: 'Dust',
  },
  water: {
    id: 'water',
    label: 'Moisture Detected',
    icon: '💧',
    emoji: '🔵',
    message: 'Moisture or water droplets detected — dry the lens before shooting.',
    colorVar: '--c-water',
    tintVar: '--t-water',
    short: 'Water',
  },
  blocked: {
    id: 'blocked',
    label: 'Camera Blocked',
    icon: '🚫',
    emoji: '🔴',
    message: 'Camera appears blocked — check for obstruction (case, finger, cover).',
    colorVar: '--c-blocked',
    tintVar: '--t-blocked',
    short: 'Blocked',
  },
  lowlight: {
    id: 'lowlight',
    label: 'Low Light',
    icon: '🌙',
    emoji: '🌑',
    message: 'Low light detected — move to a brighter area or enable flash.',
    colorVar: '--c-lowlight',
    tintVar: '--t-lowlight',
    short: 'Low Light',
  },
  blur: {
    id: 'blur',
    label: 'Motion / Focus Blur',
    icon: '🌫️',
    emoji: '⚪',
    message: 'Image is blurry — hold steady or check focus.',
    colorVar: '--c-blur',
    tintVar: '--t-blur',
    short: 'Blur',
  },
};

export const STATE_ORDER = ['good', 'smudge', 'dust', 'water', 'blocked', 'lowlight', 'blur'];

/* ------------------------------- HELPERS --------------------------------- */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Linear ramp: 0 at `a`, 1 at `b`. Used to turn distances into confidences. */
const ramp = (v, a, b) => clamp01((v - a) / (b - a || 1e-6));

/* ---------------------------- CLASSIFIER --------------------------------- */

/**
 * Decide the verdict for a single frame.
 *
 * Priority order matters and is deliberate — it goes from "most physically
 * unambiguous" to "most inferential":
 *
 *   1. BLOCKED   — if the sensor sees nothing, nothing else can be judged.
 *   2. LOW LIGHT — exposure gates everything downstream; a dark frame is
 *                  *always* soft, so we must rule this out before calling blur.
 *   3. WATER     — a strong, specific optical signature (round speculars).
 *   4. SMUDGE    — localised softness with sharp regions remaining.
 *   5. DUST      — dark specks on an otherwise sharp frame.
 *   6. BLUR      — uniform global softness with nothing localised.
 *   7. GOOD      — nothing tripped.
 *
 * @param {object} s scores from analyzeFrame()
 * @param {object} T thresholds (injectable so the UI can tune them live)
 * @returns {{state: string, confidence: number, reason: string, ranked: Array}}
 */
export function classifyFrame(s, T = THRESHOLDS) {
  const candidates = [];

  /* -- 1. BLOCKED ------------------------------------------------------- */
  // Large uniform dark region + near-zero structure. All three must agree,
  // which is what stops a plain dark room from reading as "blocked".
  {
    const darkCover = ramp(s.blockagePercent, T.BLOCKAGE_PERCENT - 22, 96);
    const flat = 1 - ramp(s.globalContrastVariance, 8, T.BLOCKAGE_VARIANCE);
    const noEdges = 1 - ramp(s.edgeDensity, 0.2, T.BLOCKAGE_EDGE_DENSITY);
    const score = darkCover * 0.5 + flat * 0.28 + noEdges * 0.22;
    if (
      s.blockagePercent >= T.BLOCKAGE_PERCENT &&
      s.globalContrastVariance < T.BLOCKAGE_VARIANCE &&
      s.edgeDensity < T.BLOCKAGE_EDGE_DENSITY
    ) {
      candidates.push({
        state: 'blocked',
        confidence: 0.62 + score * 0.38,
        reason: `${s.blockagePercent.toFixed(0)}% of frame is dark & featureless (variance ${s.globalContrastVariance.toFixed(0)}, edges ${s.edgeDensity.toFixed(2)}%)`,
      });
    }
  }

  /* -- 2. LOW LIGHT ------------------------------------------------------ */
  // Underexposed but structurally intact. Confirmed by histogram shape so a
  // half-bright scene doesn't average its way into a false positive.
  {
    const darkness = 1 - ramp(s.brightnessMean, T.DARK_FLOOR, T.LOW_LIGHT_THRESHOLD + 22);
    const shadowHeavy = ramp(s.shadowRatio, T.LOW_LIGHT_SHADOW_RATIO - 22, 92);
    if (
      s.brightnessMean < T.LOW_LIGHT_THRESHOLD &&
      s.shadowRatio > T.LOW_LIGHT_SHADOW_RATIO - 18
    ) {
      candidates.push({
        state: 'lowlight',
        confidence: 0.58 + (darkness * 0.6 + shadowHeavy * 0.4) * 0.42,
        reason: `Mean luma ${s.brightnessMean.toFixed(0)}/255 with ${s.shadowRatio.toFixed(0)}% of pixels in shadow band`,
      });
    }
  }

  /* -- 3. WATER / MOISTURE ---------------------------------------------- */
  // Round specular blobs + soft refraction rings. Requires several blobs so a
  // single lamp reflection can't trigger it.
  {
    if (s.dropletScore >= T.MOISTURE_SCORE && s.brightBlobCount >= T.MOISTURE_MIN_BLOBS) {
      const strength = ramp(s.dropletScore, T.MOISTURE_SCORE, 88);
      const plurality = ramp(s.brightBlobCount, T.MOISTURE_MIN_BLOBS, 14);
      candidates.push({
        state: 'water',
        confidence: 0.55 + (strength * 0.65 + plurality * 0.35) * 0.45,
        reason: `${s.brightBlobCount} circular speculars with soft refraction rings (droplet score ${s.dropletScore.toFixed(0)})`,
      });
    }
  }

  /* -- 4. SMUDGE (localised softness) ------------------------------------ */
  // THE headline discriminator: some cells are far softer than the median
  // cell, but not all of them — i.e. part of the frame is veiled while the
  // rest stays sharp. Uniform softness is explicitly excluded (that's blur).
  {
    // Count cells that are still *genuinely* sharp (well above the frame's own
    // blur floor). A smudge veils part of the scene while leaving the rest
    // crisp, so sharp and soft cells must COEXIST. Under global defocus the
    // sharp population collapses to zero — which is precisely how these two
    // otherwise similar-looking conditions are told apart.
    // Absolute reference, deliberately not relative to this frame's own median:
    // under global defocus the median collapses too, so a relative test would
    // keep finding "sharp" cells inside a totally blurred frame.
    const sharpCells = s.gridCellScores.filter(
      (c) => c.acutance > T.SHARP_CELL_ACUTANCE && c.blur > T.SMUDGE_MIN_GLOBAL_BLUR
    ).length;
    const sharpRatio = s.gridCellScores.length ? sharpCells / s.gridCellScores.length : 0;

    const localised =
      s.softCellRatio >= T.SMUDGE_SOFT_CELL_MIN &&
      s.softCellRatio <= T.SMUDGE_SOFT_CELL_MAX &&
      s.sharpnessSpread >= T.SMUDGE_SPREAD &&
      s.maxCellBlur > T.SMUDGE_MIN_GLOBAL_BLUR &&
      sharpRatio >= T.SMUDGE_MIN_SHARP_CELLS;
    if (localised) {
      const spread = ramp(s.sharpnessSpread, T.SMUDGE_SPREAD, 26);
      const coverage = ramp(s.softCellRatio, T.SMUDGE_SOFT_CELL_MIN, 0.5);
      candidates.push({
        state: 'smudge',
        confidence: 0.52 + (spread * 0.55 + coverage * 0.45) * 0.46,
        reason: `${(s.softCellRatio * 100).toFixed(0)}% of cells veiled while ${(sharpRatio * 100).toFixed(0)}% stay sharp (spread ${s.sharpnessSpread.toFixed(1)}x) — localised, not global`,
      });
    }
  }

  /* -- 5. DUST ----------------------------------------------------------- */
  // Dark high-frequency specks riding on a sharp frame.
  {
    if (s.speckDensity >= T.DUST_SPECK_DENSITY && s.blurVariance > T.DUST_MIN_SHARPNESS) {
      const density = ramp(s.speckDensity, T.DUST_SPECK_DENSITY, 9);
      candidates.push({
        state: 'dust',
        confidence: 0.5 + density * 0.42,
        reason: `Speck density ${s.speckDensity.toFixed(1)}% on a sharp frame (blur var ${s.blurVariance.toFixed(0)})`,
      });
    }
  }

  /* -- 6. GLOBAL BLUR ---------------------------------------------------- */
  // Everything soft, adequately lit, nothing localised, not blocked.
  {
    // Focus is only measurable when there is DETAIL to be in focus. A camera
    // aimed at a blank wall or clear sky has almost no high-frequency energy,
    // but it is not "blurry" — there is simply nothing to resolve. Gating on
    // tonal variance stops that very common framing from raising a false
    // alarm; a genuinely defocused real scene keeps its broad tonal range
    // (blur redistributes high frequencies, it doesn't flatten the histogram).
    const hasContent = s.globalContrastVariance >= T.BLUR_MIN_CONTENT_VAR;
    if (
      hasContent &&
      s.blurVariance < T.BLUR_THRESHOLD &&
      s.brightnessMean >= T.LOW_LIGHT_THRESHOLD &&
      s.blockagePercent < T.BLOCKAGE_PERCENT
    ) {
      const softness = 1 - ramp(s.blurVariance, 2, T.BLUR_THRESHOLD);
      candidates.push({
        state: 'blur',
        confidence: 0.55 + softness * 0.4,
        reason: `Laplacian variance ${s.blurVariance.toFixed(0)} < ${T.BLUR_THRESHOLD} uniformly across frame (spread only ${s.sharpnessSpread.toFixed(1)}x)`,
      });
    }
  }

  /* -- 7. GOOD (fallback) ------------------------------------------------ */
  if (!candidates.length) {
    const sharpness = ramp(s.blurVariance, T.BLUR_THRESHOLD, T.SHARP_REFERENCE);
    const exposure = ramp(s.brightnessMean, T.LOW_LIGHT_THRESHOLD, 118);
    const evenness = 1 - clamp01(s.softCellRatio / 0.5);
    return {
      state: 'good',
      confidence: 0.6 + (sharpness * 0.42 + exposure * 0.28 + evenness * 0.3) * 0.4,
      reason: `Sharp (${s.blurVariance.toFixed(0)}), well exposed (${s.brightnessMean.toFixed(0)}), uniform across all ${s.gridCellScores.length} cells`,
      ranked: [],
    };
  }

  // Highest-priority candidate wins; ties broken by confidence.
  const priority = ['blocked', 'lowlight', 'water', 'smudge', 'dust', 'blur'];
  candidates.sort(
    (a, b) =>
      priority.indexOf(a.state) - priority.indexOf(b.state) ||
      b.confidence - a.confidence
  );
  const best = candidates[0];
  return {
    state: best.state,
    confidence: Math.min(0.99, best.confidence),
    reason: best.reason,
    ranked: candidates,
  };
}

/* ---------------------------- HYSTERESIS --------------------------------- */

/**
 * Debounce layer. A raw per-frame classifier flickers between neighbouring
 * states on noisy frames, which looks broken on stage. We require the same
 * verdict to win CONSECUTIVE_FRAMES analysed frames in a row (~0.5s at 10fps)
 * before the UI is allowed to change.
 *
 * Stateful, so it lives in a small class the React layer holds in a ref.
 */
export class StateStabilizer {
  constructor(required = THRESHOLDS.CONSECUTIVE_FRAMES) {
    this.required = required;
    this.committed = 'good';
    this.committedConfidence = 0.8;
    this.committedReason = 'Initialising…';
    this.pending = null;
    this.streak = 0;
  }

  /**
   * @returns {{state, confidence, reason, changed, streak, required, pending}}
   */
  push(result) {
    let changed = false;

    if (result.state === this.committed) {
      // Reinforces the current verdict — reset any pending challenger.
      this.pending = null;
      this.streak = 0;
      this.committedConfidence =
        this.committedConfidence * 0.7 + result.confidence * 0.3; // smooth
      this.committedReason = result.reason;
    } else if (result.state === this.pending) {
      this.streak++;
      if (this.streak >= this.required) {
        this.committed = result.state;
        this.committedConfidence = result.confidence;
        this.committedReason = result.reason;
        this.pending = null;
        this.streak = 0;
        changed = true;
      }
    } else {
      this.pending = result.state;
      this.streak = 1;
    }

    return {
      state: this.committed,
      confidence: this.committedConfidence,
      reason: this.committedReason,
      changed,
      streak: this.streak,
      required: this.required,
      pending: this.pending,
    };
  }

  /** Force a state immediately — used by Demo Mode so buttons feel instant. */
  force(stateId, confidence, reason) {
    const changed = this.committed !== stateId;
    this.committed = stateId;
    this.committedConfidence = confidence;
    this.committedReason = reason;
    this.pending = null;
    this.streak = 0;
    return changed;
  }
}
