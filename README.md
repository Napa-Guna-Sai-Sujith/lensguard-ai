# LensGuard AI

**Real-time, on-device camera lens health monitor.** Watches a live camera feed and
continuously classifies *why* image quality is poor — smudge, dust, moisture, blockage,
low light, or motion blur — entirely in the browser.

> **No backend. No API calls. No internet after load.** Every frame is analysed
> client-side and never leaves the device. Built for the hackathon's "Red Light"
> (no-connectivity) phase.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build && npm run preview     # production build
npm run test:engine                  # headless engine test (12 cases)
npm run test:demo                    # verifies each demo button's detection path
```

> **Camera note:** browsers only grant `getUserMedia` on `https://` or `localhost`.
> To demo from a phone on the same Wi-Fi, run `npm run dev -- --host` and use an
> HTTPS tunnel, **or** just use Demo Mode — it works with no camera at all.

---

## The 7 states

| State | Color | Icon | Trigger signature |
|---|---|---|---|
| Good / Clear | 🟢 Green | ✅ | Sharp, well-lit, uniform |
| Lens Smudge | 🟠 Orange | 👆 | Localized softness + veiling glare, sharp regions remain |
| Dust / Debris | 🟤 Brown | 🟤 | Small dark specks on a calm, sharp background |
| Water / Moisture | 🔵 Blue | 💧 | Round speculars + soft refraction rings |
| Blockage | 🔴 Red | 🚫 | Large dark + featureless region |
| Low Light | 🌑 Dark Gray | 🌙 | Low mean luma + shadow-heavy histogram |
| Motion / Focus Blur | ⚪ Slate | 🌫️ | Uniform global softness, normal exposure |

**Scope, stated deliberately:** LensGuard detects *observable, fixable, in-the-moment*
capture problems. It does **not** diagnose physical hardware damage (cracked elements,
sensor defects, failed OIS) — those need reference targets and calibration data a live
preview cannot provide, and guessing would produce confident nonsense.

---

## Architecture — two-tier inference

```
Camera → 160×120 canvas → ┌ TIER 1  pure-JS CV  (~2 ms, always on)  ┐ → hysteresis → verdict
                          └ TIER 2  TF.js model (optional booster)  ┘
```

### Tier 1 — heuristic CV engine (`src/lib/frameAnalysis.js`)
Always on, runs every analysed frame, **~2 ms**. Pure JavaScript pixel math:

- **Grayscale + histogram** — single pass, BT.601 luma (`0.299R + 0.587G + 0.114B`)
- **Blur/focus** — Laplacian variance (variance-of-Laplacian focus metric) + edge density
- **Global variance** — tonal range; separates *blocked* from *blurred*
- **8×6 grid acutance** — per-cell high-frequency energy ÷ tonal energy
- **Bright-blob pass** — iterative flood fill + roundness + refraction-ring test
- **Dark-speck pass** — radius-3 ring sampling for dust islands
- **Blockage** — grid cells that are simultaneously dark *and* featureless

**Why it's fast:** analysis runs on a 160×120 downsample, not the full sensor frame.
Lens defects are low-frequency relative to the sensor, so 1/16th of the pixels costs no
diagnostic signal and buys a ~16× speedup. Video stays at native fps; analysis is
throttled to 10 fps.

**Why it's phone-realistic:** every operation (luma conversion, Laplacian convolution,
connected components) is a fixed-function primitive that maps onto a Snapdragon DSP/NPU
pipeline. No GPU, no server, negligible battery.

### The key discriminator — smudge vs. blur

This is the core technical idea. A shaky hand blurs the **whole** frame; a smudge veils
**part** of it. Raw per-cell blur can't tell "soft region" from "blank wall" — both are
low. So each cell is scored by **acutance** (high-frequency energy ÷ tonal energy):
optical softening destroys high frequencies while leaving tonal range intact, so acutance
collapses; a plain wall has little of either and stays mid-range.

A smudge is then declared only when soft cells **coexist with genuinely sharp cells**.
Under global defocus the sharp population collapses to zero — which is exactly what
separates the two.

### Tier 2 — optional ML booster (`src/lib/mlModel.js`)
Ships **disabled**, and fails silently by design. To enable: train 5 classes on
[Teachable Machine](https://teachablemachine.withgoogle.com/train/image), export
TensorFlow.js, drop `model.json` + `weights.bin` + `metadata.json` into `public/model/`.

It can only **reinforce or soften** Tier-1 confidence — never override the verdict. A
heuristic we can explain beats a 200-sample classifier we can't. If it's absent, offline,
or throws, the app is unaffected.

---

## Reliability engineering

**Hysteresis** — the raw classifier flickers on noisy frames, which looks broken on
stage. A verdict must win **5 consecutive analysed frames** (~0.5 s) before the UI
changes. The status card shows the settling counter live.

**Calibration** — every threshold is a named constant at the top of
`src/lib/classifyState.js` and is displayed in the About panel. Tune during rehearsal
without touching logic.

**Validated against 19 test cases** (`npm run test:engine && npm run test:demo`):
7 detection states, 7 demo paths, and 5 adversarial negatives that must *not* false-alarm
— blank wall, backlit window, dim-but-fine, bright sky, high contrast. A camera pointed at
a blank wall reports **Clear**, not "blurry": you cannot judge focus without scene detail.

---

## Demo Mode — the judge safety net

Six buttons (and keys `1`–`6`) inject **physically-modelled distortions into the actual
pixel buffer the detector reads** — spatially-varying low-pass + veiling glare for smudge,
speculars + refraction warp for water, exposure scaling + read noise for low light, and so on.

The verdict is produced by the **same detection path** as a physically dirty lens. Nothing
is hard-coded. This works **even with camera permission denied**, so a blocked venue
browser can't kill the demo.

If the live frame is too texture-free to veil (some webcams, flat walls), the app
substitutes a textured reference scene and **says so on screen** — the detection stays
real, only the subject is standardised.

### Keyboard shortcuts
`1` smudge · `2` dust · `3` water · `4` blocked · `5` low light · `6` blur · `0` clear
· `T` theme · `G` heat grid · `?` about

---

## Demo script

1. **Open** → live feed, 🟢 Clear. Press `T` to show full dual-theme re-skin.
2. **Smudge the lens** (or press `1`) → 🟠 within ~1 s. Point at the breakdown panel:
   *contamination localisation* spikes while *blur/focus* stays healthy — press `G` to
   show the heat grid marking exactly which cells are veiled. **This is the money shot:**
   it's how the engine knows a smudge from a shaky hand.
3. **Clean it** → recovers to 🟢, transition logged in the timeline.
4. **Cover the lens** (or `4`) → 🔴 Blocked, near-instant, 99% confidence.
5. **Cup your hand / dim the room** (or `5`) → 🌙 Low light.
6. **Talk architecture** — two-tier design, ~2 ms/frame shown live in the status card,
   100% on-device for the Red Light phase.
7. **Lab Mode tab** → same engine batch-analysing sample images with CSV export: the
   phone + laptop tuning workflow.
8. **Close on scope:** *"This isn't diagnosing broken hardware — it's catching the
   everyday, fixable reasons your photos come out bad, in real time, entirely on-device."*

**Props:** a coin dipped in water (droplets), a tissue smear (smudge), your finger (blockage).

---

## Project structure

```
src/
  App.jsx                     layout, tabs, shortcuts, event log
  components/
    CameraView.jsx            video + demo overlay + heat grid + permission UI
    StatusCard.jsx            verdict hero, confidence, evidence line
    DetectionPanel.jsx        live numeric instrumentation
    ConfidenceMeter.jsx       animated confidence bar
    Sparkline.jsx             dependency-free SVG history graphs
    EventHistory.jsx          session timeline
    DemoControls.jsx          judge safety net
    ThemeToggle.jsx           animated pill switch
    AboutModal.jsx            architecture diagram + scope + constants
    ReportModal.jsx           session health report
    LabMode.jsx               batch image analysis (conceptual dev-tool view)
  lib/
    frameAnalysis.js          Tier-1 heuristic engine
    classifyState.js          rules layer + thresholds + hysteresis
    demoEffects.js            physically-modelled distortions
    mlModel.js                Tier-2 TF.js loader (optional)
    useCameraAnalysis.js      camera → canvas → engine runtime
    useTheme.js               theme persistence
  styles/theme.css            CSS variables for both themes
```

## Stack

React 19 + Vite · TailwindCSS · Framer Motion · Canvas 2D · self-hosted Inter +
JetBrains Mono (no CDN) · optional TensorFlow.js.

## Theme

Botanix-inspired brand palette, sampled from the reference design:
`#FCCD03` yellow field · `#0A0A0A` ink · `#2A2A2A` dark pill. The app renders as a
white (or near-black) shell floating on the yellow field.

Because saturated yellow fails contrast as text on white, the accent is split into two
tokens: `--accent` for fills/borders (paired with ink text) and `--accent-ink` for any
text, link, or focus ring that must stay legible. Status hues stay distinct from the
brand — smudge is pushed to a deeper amber so it reads apart from the yellow beside it.

**Layout:** live camera preview occupies the **right** panel with the session timeline
beneath it; the verdict, instrumentation, and demo controls stack on the left. On phones
the order becomes camera → verdict → breakdown so the feed stays above the fold.

Theme is resolved by an inline script in `index.html` **before first paint** — no flash of
the wrong theme. Defaults to `prefers-color-scheme`, then persists to `localStorage`.
