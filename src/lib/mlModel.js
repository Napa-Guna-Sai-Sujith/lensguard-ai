/* ============================================================================
 * Tier-2 — optional ML booster (TensorFlow.js / Teachable Machine)
 * ----------------------------------------------------------------------------
 * DESIGN CONTRACT: this module is entirely OPTIONAL and MUST fail silently.
 * Tier-1 is the product; Tier-2 is a confidence booster. If the model is
 * absent, offline, or throws, blendWithModel() returns the Tier-1 verdict
 * untouched. That is exactly the property we want for the Red Light phase —
 * no network, no model, still fully functional.
 *
 * HOW TO ENABLE (no code changes needed):
 *   1. Train 5 classes at teachablemachine.withgoogle.com/train/image
 *      (clean / smudge / dust / water / blocked), ~40 photos per class taken
 *      with the actual phone lens.
 *   2. "Export Model" → TensorFlow.js → Download → unzip.
 *   3. Drop model.json + weights.bin + metadata.json into  public/model/
 *   4. Add the TF.js runtime to index.html (or npm i @tensorflow/tfjs) and
 *      call loadModel() from the About panel toggle.
 * The bundled app ships WITHOUT weights so it stays fully offline and small.
 * ==========================================================================*/

const CLASS_TO_STATE = {
  clean: 'good',
  good: 'good',
  smudge: 'smudge',
  fingerprint: 'smudge',
  dust: 'dust',
  debris: 'dust',
  water: 'water',
  moisture: 'water',
  blocked: 'blocked',
  obstruction: 'blocked',
};

const state = {
  status: 'absent', // absent | loading | ready | error
  model: null,
  labels: [],
  lastAgreement: null,
  error: '',
  inferenceMs: 0,
};

export function getModelStatus() {
  return {
    status: state.status,
    labels: state.labels,
    agreement: state.lastAgreement,
    error: state.error,
    inferenceMs: state.inferenceMs,
  };
}

/**
 * Attempt to load a Teachable Machine export from /model/.
 * Never throws — resolves to false if unavailable.
 */
export async function loadModel(basePath = `${import.meta.env.BASE_URL || '/'}model/`) {
  if (state.status === 'loading' || state.status === 'ready') return state.status === 'ready';
  state.status = 'loading';
  state.error = '';
  try {
    const tf = globalThis.tf;
    if (!tf) throw new Error('TensorFlow.js runtime not present on the page.');

    const metaRes = await fetch(`${basePath}metadata.json`);
    if (!metaRes.ok) throw new Error('No model bundle found in /public/model/.');
    const meta = await metaRes.json();
    state.labels = meta.labels || [];

    state.model = await tf.loadLayersModel(`${basePath}model.json`);
    state.status = 'ready';
    return true;
  } catch (err) {
    state.status = 'absent';
    state.error = err?.message || String(err);
    state.model = null;
    return false;
  }
}

export function unloadModel() {
  try { state.model?.dispose?.(); } catch { /* ignore */ }
  state.model = null;
  state.status = 'absent';
  state.lastAgreement = null;
}

/**
 * Blend a Tier-1 verdict with the model's opinion.
 *
 * Deliberately conservative: the model can only REINFORCE or SOFTEN Tier-1's
 * confidence, never override the verdict. A heuristic we can explain beats a
 * 200-sample classifier we can't — and if the model disagrees we'd rather show
 * lower confidence than flip to a state we cannot justify to a judge.
 */
export function blendWithModel(tier1, canvas) {
  if (state.status !== 'ready' || !state.model || !canvas) {
    state.lastAgreement = null;
    return tier1;
  }
  try {
    const tf = globalThis.tf;
    const t0 = performance.now();
    const probs = tf.tidy(() => {
      const input = tf.browser
        .fromPixels(canvas)
        .resizeBilinear([224, 224])
        .toFloat()
        .div(127.5)
        .sub(1)
        .expandDims(0);
      return state.model.predict(input).dataSync();
    });
    state.inferenceMs = performance.now() - t0;

    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[bestIdx]) bestIdx = i;
    const label = (state.labels[bestIdx] || '').toLowerCase().trim();
    const mlState = CLASS_TO_STATE[label] || null;
    const mlConf = probs[bestIdx];

    const agrees = mlState === tier1.state;
    state.lastAgreement = { agrees, label, confidence: mlConf, mappedState: mlState };

    // Weighted blend: 70% heuristic, 30% model — and only when they agree.
    const confidence = agrees
      ? Math.min(0.99, tier1.confidence * 0.7 + mlConf * 0.3 + 0.06)
      : Math.max(0.3, tier1.confidence * 0.86);

    return { ...tier1, confidence, mlAgrees: agrees, mlLabel: label, mlConfidence: mlConf };
  } catch (err) {
    state.error = err?.message || String(err);
    state.lastAgreement = null;
    return tier1;
  }
}
