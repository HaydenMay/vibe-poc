# Chromatic Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable, black-at-silence rainbow ambience scene that responds distinctly to the existing audio frame in browser and Lively builds.

**Architecture:** Add a dedicated `VibeEnvironment` implementation and a small audio-response mapper for Chromatic Drift. Keep the shared render loop and providers, and replace only the active environment when the accessible scene picker changes.

**Tech Stack:** Angular standalone component, TypeScript, Canvas 2D, existing custom TypeScript/Node scene checks, Angular production builds.

**Spec:** `docs/superpowers/specs/2026-09-24-chromatic-drift-design.md`

## Global Constraints

- Keep Neon Rain and its current composition available.
- Use one active canvas environment at a time; both environments receive the existing `AudioReactiveFrame`.
- Place the accessible scene picker in the bottom-right, adapted on small screens to avoid covering other controls.
- At exact silence render pure black; near-zero readings may show only near-imperceptible color and no large ribbon reveals.
- Use a fixed pool of six ribbons; never increase object counts based on audio.
- Keep `AudioReactiveFrame`, both audio providers, their smoothing/grouping, Lively metadata, GitHub Pages configuration, and Neon Rain's design unchanged.
- Avoid camera motion, spectrum UI, native audio code, per-frame large arrays, geometry rebuilding, DOM work, and extra Angular change detection.
- Keep performance near the existing 29 FPS baseline and prefer 30 FPS or higher on the same setup.
- Leave all changes uncommitted.

## Review Focus

- **Exact silence:** canvas remains black with no ribbon stroke or beat accent. Pin this in Task 2's renderer check.
- **Near-silence noise:** readings below the `0.04` normalized near-silence threshold do not visibly reveal ribbons. Pin this in Tasks 1 and 2.
- **Isolated audio channels:** one reading changes only its assigned visual response plus the shared visibility envelope. Pin this in Task 1.
- **Beat transients:** a beat retriggers a bounded traveling impulse that fully decays in 400–800 ms; beat strength alone does nothing. Pin this in Task 1 and verify its drawn accent in Task 2.
- **Loud combined input:** response outputs stay bounded and the six ribbon slots remain fixed. Pin this in Tasks 1 and 2.

---

### Task 1: Chromatic Drift audio response

**Files:**
- Create: `src/app/chromatic-drift-audio-response.ts`
- Create: `scripts/test-chromatic-drift.cjs`
- Modify: `tsconfig.scene-test.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `AudioReactiveFrame` and delta time in seconds.
- Produces: `ChromaticDriftAudioResponse.update(frame, deltaTime): ChromaticDriftResponseFrame` with bounded `ribbonVisibility`, `volumeGlow`, `bassWidth`, `midRipple`, `highGlint`, `energyDrift`, `beatPulse`, and `beatProgress` fields.

- [ ] **Step 1: Add focused failing response assertions**

In `scripts/test-chromatic-drift.cjs`, add a silence factory and a `settle(frame, seconds = 1.5)` helper that advances `ChromaticDriftAudioResponse.update(frame, 1 / 30)` for `Math.ceil(seconds * 30)` frames. Add this runner after the existing scene response runner in `package.json`. Assert:

```js
const silent = settle(silence());
assert.equal(silent.ribbonVisibility, 0);
assert.equal(silent.beatPulse, 0);

const volume = settle({ ...silence(), volume: 0.2 });
assert.ok(volume.volumeGlow > 0.15);
assert.equal(volume.bassWidth, 0);
assert.equal(volume.midRipple, 0);

const bass = settle({ ...silence(), bass: 0.2 });
assert.ok(bass.bassWidth > 0.15);
assert.equal(bass.volumeGlow, 0);
assert.equal(bass.energyDrift, 0);
```

Add analogous isolated assertions for `mid`, `high`, and `energy`; add `volume: 0.02` and assert that `ribbonVisibility` remains zero; assert `beat: true, beatStrength: 0.9` starts `beatPulse > 0.8` with progress 0, and assert pulse reaches 0 after 0.8 seconds of silence. Assert beat strength without `beat: true` creates no pulse, and all response fields remain finite and in `[0, 1]` for combined and malformed values.

- [ ] **Step 2: Run the focused test and confirm the missing response fails**

Add `src/app/chromatic-drift-audio-response.ts` to the `files` array in `tsconfig.scene-test.json`, then run: `npm run test:scene`

Expected RED: TypeScript reports that the listed response source does not exist yet.

- [ ] **Step 3: Implement the minimal bounded mapper**

Create a response class that applies a separate clamped nonlinear curve and smoothing state to volume, bass, mid, high, and energy. Use a normalized input gate of `0.04` so a `0.02` input remains visually zero while a moderate `0.2` input yields useful response. Form shared ribbon visibility from the strongest active channel rather than summing every channel. Track beat rising edges, set pulse strength from beat strength, advance its progress, and force it to zero by 0.8 seconds. Do not change provider code or normalization.

- [ ] **Step 4: Run response assertions and wire the focused script**

Run: `npx tsc -p tsconfig.scene-test.json && node scripts/test-chromatic-drift.cjs`

Expected: isolated mappings, silence gating, beat start/decay, and output bounds pass. Run `npm run test:scene` again to confirm it executes alongside the existing scene response checks.

---

### Task 2: Fixed-pool Chromatic Drift renderer

**Files:**
- Create: `src/app/chromatic-drift.environment.ts`
- Modify: `tsconfig.scene-test.json`
- Modify: `scripts/test-chromatic-drift.cjs`

**Interfaces:**
- Consumes: `AudioReactiveFrame`, delta time, a canvas, and the response fields from Task 1.
- Produces: a `VibeEnvironment` whose fixed six ribbon slots animate through the same `start`, `update`, `resize`, and `stop` methods as Neon Rain.

- [ ] **Step 1: Add failing canvas behavior checks**

Add a canvas/context stub to `scripts/test-chromatic-drift.cjs`. Record `fillRect`, `stroke`, `lineTo`, and `ellipse` calls together with the current canvas styles. Construct and resize `ChromaticDriftEnvironment` to `960 × 540`, start it, and assert:

```js
const slots = environment.ribbons.length;
assert.equal(slots, 6);
environment.update(silence(), 1 / 30);
assert.ok(calls.some((call) => call.method === 'fillRect' && call.fillStyle === '#000000'));
assert.equal(calls.filter((call) => call.method === 'stroke').length, 0);
assert.equal(calls.filter((call) => call.method === 'ellipse').length, 0);
```

Then update with a moderate combined music frame and assert ribbon strokes occur while `environment.ribbons.length` remains six. Update with a strong beat and assert a local impulse accent is drawn; continue silence updates and assert that accent disappears. Add `src/app/chromatic-drift.environment.ts` to the test TypeScript configuration before running the test.

- [ ] **Step 2: Run the renderer check and confirm it fails for the missing environment**

Run: `npx tsc -p tsconfig.scene-test.json`

Expected: TypeScript reports that `chromatic-drift.environment` is missing.

- [ ] **Step 3: Implement the renderer with six reusable ribbon slots**

Create `ChromaticDriftEnvironment implements VibeEnvironment`. On resize, initialize six ribbon records with varied seeded positions, angles, hue offsets, curve phases, and reveal timing. In each update, fill the canvas black, update those same six records in place, and skip ribbon drawing when shared visibility is zero. Draw active ribbons as large soft multi-hue Canvas 2D strokes with low-cost layered lines and smooth path curves. Map `bassWidth` to ribbon width, `midRipple` to curve variation, `highGlint` to small edge highlights, `energyDrift` to flow/reveal speed, and `beatPulse` to a brief localized traveling accent. Keep ambient baseline movement below the near-silence visibility gate. Allocate no arrays or scene geometry during update.

- [ ] **Step 4: Run scene response and renderer checks**

Run: `npm run test:scene`

Expected: the existing Neon Rain response tests and the new Chromatic Drift response, black-silence, fixed-slot, audio-activity, and beat-accent checks all pass.

---

### Task 3: Scene picker, lifecycle, and project integration

**Files:**
- Create: `src/app/vibe-scenes.ts`
- Modify: `src/app/app.ts`
- Modify: `src/app/app.html`
- Modify: `src/app/app.css`
- Modify: `scripts/test-chromatic-drift.cjs`
- Modify: `tsconfig.scene-test.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: a `VibeSceneId` (`'neon-rain'` or `'chromatic-drift'`) and the shared canvas.
- Produces: scene labels and a factory returning the corresponding `VibeEnvironment`; app selection switches that environment without restarting audio.

- [ ] **Step 1: Add a failing scene-factory check**

Add `vibe-scenes.ts` to the scene test configuration and test that `VIBE_SCENES` contains the two scene IDs and that `createVibeEnvironment('chromatic-drift', canvas)` and `createVibeEnvironment('neon-rain', canvas)` create their corresponding environment classes. Run `npm run test:scene`; expected RED: TypeScript reports the missing scene-factory source.

- [ ] **Step 2: Implement the scene IDs and factory**

Export the two literal IDs, their UI labels, and a factory with an exhaustive switch. The factory constructs `ChromaticDriftEnvironment` or `NeonRainEnvironment` on the supplied existing canvas.

- [ ] **Step 3: Add the accessible bottom-right picker and replace only the active renderer**

Add a labeled native `<select>` with the two UI labels and a change handler in `app.html`. Anchor it bottom-right in `app.css`; reserve space above the existing Stop control while listening and adjust the welcome-panel spacing on narrow screens. In `app.ts`, initialize the selected environment through the factory, and on selection stop the current environment, create/start the next environment, and immediately resize it to the current viewport. Keep the same animation frame, audio provider, debug values, and capture status running throughout the switch. Update the masthead's environment label to reflect the selection.

- [ ] **Step 4: Update scene documentation**

Update the README with the picker and this mapping: Volume → ribbon glow; Bass → ribbon width; Mid → wave bend/ripple; High → fine glints; Energy → ribbon flow; Beat → traveling color accent. State that response curves are bounded and nonlinear, and that exact silence is black.

- [ ] **Step 5: Run tests and production checks**

Run each command in sequence and require a successful exit:

```sh
npm run test:scene
npm run test:lively
npx tsc -p tsconfig.app.json --noEmit
npm run build:web
npm run build:lively
```

Expected: all response tests pass, the existing Lively provider suite passes, both production builds complete, and the Lively command creates `dist/Vibe-Neon-Rain-Lively.zip`.

- [ ] **Step 6: Manually compare both scenes and verify layout/performance**

In the browser and Lively builds, select both scenes while audio remains active. Verify the picker is bottom-right and does not overlap controls at desktop and narrow widths; confirm debug continues updating during a switch. In Chromatic Drift, compare exact silence, near-silence, quiet music, bass-heavy music, treble-heavy music, energetic mixed music, and clear drum transients. Confirm exact silence stays black, moderate input reveals colored ribbons, each frequency characteristic looks distinct, beats decay naturally, and the six-slot renderer remains near the existing approximately 29 FPS setup.

---
