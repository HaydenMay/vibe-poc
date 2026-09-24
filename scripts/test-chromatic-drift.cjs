const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ChromaticDriftAudioResponse } = require('../tmp/scene-test/app/chromatic-drift-audio-response.js');
const { ChromaticDriftEnvironment } = require('../tmp/scene-test/app/chromatic-drift.environment.js');
const { VIBE_SCENES, createVibeEnvironment } = require('../tmp/scene-test/app/vibe-scenes.js');

const appTemplate = fs.readFileSync(path.join(__dirname, '../src/app/app.html'), 'utf8');
const appStyles = fs.readFileSync(path.join(__dirname, '../src/app/app.css'), 'utf8');
assert.match(appTemplate, /<main class="environment" \[class\.chromatic-drift\]="selectedScene\(\) === 'chromatic-drift'"/,
  'the active scene marks the shared overlay for scene-specific styling');
assert.match(appStyles, /\.environment\.chromatic-drift \.vignette\s*\{\s*background:\s*none;\s*\}/,
  'Chromatic Drift has no blue vignette over its black canvas');
const debugPanelRule = appStyles.match(/\.debug-panel\s*\{[^}]*\}/)?.[0] ?? '';
const debugPanelReserve = debugPanelRule.match(/max-height:\s*calc\(100dvh - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\) - (\d+)px\)/);
assert.ok(debugPanelReserve, 'the debug panel reserves space for the bottom controls');
const debugBottomAtShortHeight = 65 + (400 - Number(debugPanelReserve[1]));
const pickerTopAtShortHeight = 400 - 66 - 42;
assert.ok(debugBottomAtShortHeight <= pickerTopAtShortHeight - 10,
  'a scrollable debug panel stops above the scene picker on a short screen');

const silence = () => ({
  volume: 0,
  bass: 0,
  mid: 0,
  high: 0,
  energy: 0,
  beat: false,
  beatStrength: 0,
});

const settle = (input, seconds = 1.5) => {
  const response = new ChromaticDriftAudioResponse();
  let output;
  for (let index = 0; index < Math.ceil(seconds * 30); index++) {
    output = response.update(input, 1 / 30);
  }
  return output;
};

const silent = settle(silence());
assert.equal(silent.ribbonVisibility, 0, 'exact silence does not reveal any ribbons');
assert.equal(silent.volumeGlow, 0, 'exact silence leaves color glow black');
assert.equal(silent.beatPulse, 0, 'exact silence has no beat accent');

const nearSilence = settle({ ...silence(), volume: 0.02 });
assert.equal(nearSilence.ribbonVisibility, 0, 'near-silence readings stay below the visibility gate');

const returningToSilence = new ChromaticDriftAudioResponse();
for (let index = 0; index < 30; index++) {
  returningToSilence.update({ ...silence(), volume: 0.5 }, 1 / 30);
}
let faded = returningToSilence.update(silence(), 1 / 30);
for (let index = 0; index < 90; index++) faded = returningToSilence.update(silence(), 1 / 30);
assert.equal(faded.ribbonVisibility, 0, 'music settles all the way back to black');

const volume = settle({ ...silence(), volume: 0.2 });
assert.ok(volume.ribbonVisibility > 0.15, 'moderate volume reveals useful but bounded ribbon visibility');
assert.ok(volume.volumeGlow > 0.15, 'moderate volume lifts ribbon glow');
assert.equal(volume.bassWidth, 0, 'volume does not widen ribbons');
assert.equal(volume.midRipple, 0, 'volume does not bend the wave pattern');
assert.equal(volume.highGlint, 0, 'volume does not add fine glints');
assert.equal(volume.energyDrift, 0, 'volume does not change flow speed');

const bass = settle({ ...silence(), bass: 0.2 });
assert.ok(bass.ribbonVisibility > 0.15, 'moderate bass reveals ribbons');
assert.ok(bass.bassWidth > 0.15, 'moderate bass widens the broad ribbons');
assert.equal(bass.volumeGlow, 0, 'bass does not lift overall glow');
assert.equal(bass.midRipple, 0, 'bass does not bend the wave pattern');
assert.equal(bass.energyDrift, 0, 'bass does not change flow speed');

const mid = settle({ ...silence(), mid: 0.2 });
assert.ok(mid.midRipple > 0.15, 'moderate mids bend and ripple ribbons');
assert.equal(mid.volumeGlow, 0, 'mids do not lift overall glow');
assert.equal(mid.bassWidth, 0, 'mids do not widen broad ribbons');
assert.equal(mid.highGlint, 0, 'mids do not add fine glints');

const high = settle({ ...silence(), high: 0.2 });
assert.ok(high.highGlint > 0.15, 'moderate highs add small crisp glints');
assert.equal(high.volumeGlow, 0, 'highs do not lift overall glow');
assert.equal(high.bassWidth, 0, 'highs do not widen broad ribbons');
assert.equal(high.midRipple, 0, 'highs do not change broad wave shape');

const energy = settle({ ...silence(), energy: 0.2 });
assert.ok(energy.energyDrift > 0.15, 'moderate energy increases ribbon flow');
assert.equal(energy.volumeGlow, 0, 'energy does not max out color glow');
assert.equal(energy.bassWidth, 0, 'energy does not widen broad ribbons');

const beatResponse = new ChromaticDriftAudioResponse();
let beat = beatResponse.update({ ...silence(), beat: true, beatStrength: 0.9 }, 1 / 30);
assert.ok(beat.beatPulse > 0.8, 'a strong beat starts a visible color ripple');
assert.equal(beat.beatProgress, 0, 'the beat ripple starts at its origin');
beat = beatResponse.update({ ...silence(), beat: true, beatStrength: 0.9 }, 1 / 30);
assert.ok(beat.beatPulse < 0.9, 'a sustained beat reading decays instead of restarting every frame');
beatResponse.update(silence(), 1 / 30);
const retriggered = beatResponse.update({ ...silence(), beat: true, beatStrength: 0.25 }, 1 / 30);
assert.equal(retriggered.beatProgress, 0, 'a nearby beat restarts the traveling accent cleanly');
assert.ok(retriggered.beatPulse <= 1, 'nearby beats cannot accumulate above the response limit');

const noBeat = settle({ ...silence(), beatStrength: 1 });
assert.equal(noBeat.beatPulse, 0, 'beat strength without a detected beat creates no accent');

let decayed = retriggered;
for (let index = 0; index < 24; index++) decayed = beatResponse.update(silence(), 1 / 30);
assert.equal(decayed.beatPulse, 0, 'the traveling beat impulse disappears within 800 ms');
assert.equal(decayed.beatProgress, 1, 'the completed impulse reaches its endpoint');

const combined = settle({
  volume: 0.65,
  bass: 0.55,
  mid: 0.48,
  high: 0.42,
  energy: 0.7,
  beat: false,
  beatStrength: 0,
});
for (const [name, value] of Object.entries(combined)) {
  assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${name} remains bounded`);
}
assert.ok(combined.ribbonVisibility > 0, 'combined music produces colorful streaks');

const malformed = settle({
  volume: Number.NaN,
  bass: Number.POSITIVE_INFINITY,
  mid: -2,
  high: 5,
  energy: Number.NaN,
  beat: false,
  beatStrength: 1,
});
assert.equal(malformed.volumeGlow, 0, 'non-finite volume is treated as silence');
assert.equal(malformed.bassWidth, 0, 'non-finite bass is treated as silence');
assert.equal(malformed.midRipple, 0, 'negative mids are treated as silence');
assert.equal(malformed.energyDrift, 0, 'non-finite energy is treated as silence');
assert.ok(malformed.highGlint > 0.99 && malformed.highGlint <= 1, 'high values clamp safely');
assert.equal(malformed.beatPulse, 0, 'malformed beat strength alone cannot create an impulse');

const canvasCalls = [];
const gradient = { addColorStop() {} };
const createContext = () => new Proxy({
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
}, {
  get(target, property) {
    if (property in target) return target[property];
    return (...args) => canvasCalls.push({
      method: property,
      args,
      fillStyle: target.fillStyle,
      strokeStyle: target.strokeStyle,
      lineWidth: target.lineWidth,
      globalAlpha: target.globalAlpha,
    });
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});

class TestCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.context = createContext();
  }

  getContext() {
    return this.context;
  }
}

global.document = { createElement: () => new TestCanvas() };
global.window = { devicePixelRatio: 1 };

const rendererCanvas = new TestCanvas();
assert.deepEqual(VIBE_SCENES.map(({ id }) => id), ['neon-rain', 'chromatic-drift'],
  'both environments are available to the scene picker');
assert.ok(createVibeEnvironment('chromatic-drift', rendererCanvas) instanceof ChromaticDriftEnvironment,
  'the scene factory creates Chromatic Drift');
const { NeonRainEnvironment } = require('../tmp/scene-test/app/neon-rain.environment.js');
assert.ok(createVibeEnvironment('neon-rain', rendererCanvas) instanceof NeonRainEnvironment,
  'the scene factory retains Neon Rain');

const environment = new ChromaticDriftEnvironment(rendererCanvas);
environment.start();
environment.resize(960, 540);
const ribbonCount = environment.ribbons.length;
assert.equal(ribbonCount, 6, 'the scene uses six fixed ribbon slots');

canvasCalls.length = 0;
environment.update(silence(), 1 / 30);
assert.ok(canvasCalls.some((call) => call.method === 'fillRect' && call.fillStyle === '#000000'),
  'exact silence clears the full canvas to black');
assert.equal(canvasCalls.filter((call) => call.method === 'stroke').length, 0,
  'exact silence draws no color ribbons');
assert.equal(canvasCalls.filter((call) => call.method === 'ellipse').length, 0,
  'exact silence draws no beat accent');

canvasCalls.length = 0;
const music = { ...silence(), volume: 0.5, bass: 0.35, mid: 0.4, high: 0.28, energy: 0.55 };
environment.update(music, 1 / 30);
assert.ok(canvasCalls.some((call) => call.method === 'stroke'), 'music reveals broad color ribbons');
assert.equal(environment.ribbons.length, ribbonCount, 'audio never increases the ribbon slot count');

canvasCalls.length = 0;
environment.update({ ...music, beat: true, beatStrength: 0.9 }, 1 / 30);
assert.ok(canvasCalls.some((call) => call.method === 'ellipse'), 'a beat adds a local traveling accent');

canvasCalls.length = 0;
for (let index = 0; index < 24; index++) environment.update(silence(), 1 / 30);
canvasCalls.length = 0;
environment.update(silence(), 1 / 30);
assert.equal(canvasCalls.filter((call) => call.method === 'ellipse').length, 0,
  'the beat accent is no longer drawn after its short impulse');
for (let index = 0; index < 90; index++) environment.update(silence(), 1 / 30);
canvasCalls.length = 0;
environment.update(silence(), 1 / 30);
assert.equal(canvasCalls.filter((call) => call.method === 'stroke').length, 0,
  'ribbons stop drawing after audio has fully faded to silence');
assert.ok(canvasCalls.some((call) => call.method === 'fillRect' && call.fillStyle === '#000000'),
  'the renderer continues clearing the field to black after music ends');
assert.equal(environment.ribbons.length, ribbonCount, 'silence does not alter the fixed ribbon pool');
environment.stop();

const phaseEnvironment = new ChromaticDriftEnvironment(new TestCanvas());
phaseEnvironment.start();
phaseEnvironment.resize(960, 540);
const steadyMusic = { ...silence(), volume: 0.65 };
for (let index = 0; index < 1800; index++) {
  canvasCalls.length = 0;
  phaseEnvironment.update(steadyMusic, 1 / 30);
}
canvasCalls.length = 0;
phaseEnvironment.update(steadyMusic, 1 / 30);
const startBeforeEnergyChange = canvasCalls.find((call) => call.method === 'moveTo').args;
canvasCalls.length = 0;
phaseEnvironment.update({ ...steadyMusic, energy: 0.5 }, 1 / 30);
const startAfterEnergyChange = canvasCalls.find((call) => call.method === 'moveTo').args;
const positionJump = Math.hypot(
  startAfterEnergyChange[0] - startBeforeEnergyChange[0],
  startAfterEnergyChange[1] - startBeforeEnergyChange[1],
);
assert.ok(positionJump < 16, 'an energy change adjusts motion speed without a long-run phase jump');
phaseEnvironment.stop();

console.log('Chromatic Drift checks passed: independent responses, black silence, fixed ribbon pool, music activity, beat impulse, and bounds.');
