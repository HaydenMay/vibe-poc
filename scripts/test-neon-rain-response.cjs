const assert = require('node:assert/strict');
const { NeonRainAmbientEvents } = require('../tmp/scene-test/app/neon-rain-ambient-events.js');
const { NeonRainAudioResponse } = require('../tmp/scene-test/app/neon-rain-audio-response.js');

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
  const response = new NeonRainAudioResponse();
  let output;
  const count = Math.ceil(seconds * 30);
  for (let index = 0; index < count; index++) output = response.update(input, 1 / 30);
  return output;
};

const volume = settle({ ...silence(), volume: 0.2 });
assert.ok(volume.cityLight > 0.2, 'moderate volume produces visible city illumination');
assert.ok(Math.abs(volume.cityLight - Math.pow(0.2, 0.8)) < 0.01, 'volume uses its tuned nonlinear curve');
assert.equal(volume.bassReflection, 0, 'volume does not change road reflections');
assert.equal(volume.midMotion, 0, 'volume does not change fog motion');
assert.equal(volume.energyMotion, 0, 'volume does not change rain speed or wind');
assert.equal(volume.beatPulse, 0, 'volume does not create a ripple');

const bass = settle({ ...silence(), bass: 0.2 });
assert.ok(bass.bassReflection > 0.3, 'moderate bass produces useful reflection response');
assert.ok(Math.abs(bass.bassReflection - Math.pow(0.2, 0.65)) < 0.01, 'bass uses its tuned nonlinear curve');
assert.equal(bass.cityLight, 0, 'bass does not lift general city illumination');
assert.equal(bass.energyMotion, 0, 'bass does not change weather motion');

const mid = settle({ ...silence(), mid: 0.2 });
assert.ok(mid.midMotion > 0.25, 'moderate mids produce fog and window movement');
assert.ok(Math.abs(mid.midMotion - Math.pow(0.2, 0.75)) < 0.01, 'mids use their tuned nonlinear curve');
assert.equal(mid.cityLight, 0, 'mids do not lift general city illumination');
assert.equal(mid.highDetail, 0, 'mids do not change fine rain detail');

const high = settle({ ...silence(), high: 0.2 });
assert.ok(high.highDetail > 0.2, 'moderate highs brighten rain glints and motes');
assert.ok(Math.abs(high.highDetail - Math.pow(0.2, 0.8)) < 0.01, 'highs use their tuned nonlinear curve');
assert.equal(high.cityLight, 0, 'highs do not lift general city illumination');
assert.equal(high.bassReflection, 0, 'highs do not change road reflections');

const energy = settle({ ...silence(), energy: 0.2 });
assert.ok(energy.energyMotion > 0.25, 'moderate energy increases weather activity');
assert.ok(Math.abs(energy.energyMotion - Math.pow(0.2, 0.75)) < 0.01, 'energy uses its tuned nonlinear curve');
assert.equal(energy.cityLight, 0, 'energy does not max out scene illumination');
assert.equal(energy.bassReflection, 0, 'energy does not change road reflections');

const beatResponse = new NeonRainAudioResponse();
let beat = beatResponse.update({ ...silence(), beat: true, beatStrength: 0.9 }, 1 / 30);
assert.ok(beat.beatPulse > 0.8, 'a strong beat starts a visible road ripple');
assert.ok(Math.abs(beat.beatPulse - Math.pow(0.9, 0.65)) < 0.01, 'beat strength uses its tuned nonlinear curve');
assert.equal(beat.beatProgress, 0, 'the ripple begins at the skyline');
const softBeat = new NeonRainAudioResponse().update({ ...silence(), beat: true, beatStrength: 0.2 }, 1 / 30);
assert.ok(softBeat.beatPulse < beat.beatPulse, 'stronger beat strength creates a larger impulse');
beat = beatResponse.update({ ...silence(), beat: true, beatStrength: 0.9 }, 1 / 30);
assert.ok(beat.beatProgress > 0, 'a sustained beat signal advances instead of restarting each frame');
assert.ok(beat.beatPulse < 0.9, 'the ripple begins to decay after its impulse');

beatResponse.update(silence(), 1 / 30);
const reinforced = beatResponse.update({ ...silence(), beat: true, beatStrength: 0.25 }, 1 / 30);
assert.equal(reinforced.beatProgress, 0, 'a nearby beat cleanly restarts the ripple travel');
assert.ok(reinforced.beatPulse <= 1, 'nearby beats cannot cause runaway strength');

let decayed = reinforced;
for (let index = 0; index < 18; index++) decayed = beatResponse.update(silence(), 1 / 30);
assert.equal(decayed.beatPulse, 0, 'beat ripple is gone after its 600 ms visible duration');
assert.equal(decayed.beatProgress, 1, 'completed ripple reaches the end of the road');

const noBeat = settle({ ...silence(), beatStrength: 1 });
assert.equal(noBeat.beatPulse, 0, 'beat strength without a beat does not create a ripple');

const ambientEvents = new NeonRainAmbientEvents(() => 0);
let ambientEvent = { type: null, strength: 0, target: 0 };
for (let index = 0; index < 99; index++) {
  ambientEvent = ambientEvents.update(0.08);
  assert.equal(ambientEvent.type, null, 'ambient events wait through their initial quiet interval');
}
for (let index = 0; index < 3 && ambientEvent.type === null; index++) {
  ambientEvent = ambientEvents.update(0.08);
}
assert.equal(ambientEvent.type, 'sign-flicker', 'the timer selects a single ambient event');
assert.equal(ambientEvent.strength, 0, 'ambient events ease in from their baseline');
for (let index = 0; index < 10; index++) ambientEvent = ambientEvents.update(0.08);
assert.ok(ambientEvent.strength > 0.9, 'ambient event has a smooth envelope');
for (let index = 0; index < 10; index++) ambientEvent = ambientEvents.update(0.08);
assert.equal(ambientEvent.type, null, 'ambient event ends after its short duration');
for (let index = 0; index < 140; index++) {
  ambientEvent = ambientEvents.update(0.08);
  assert.equal(ambientEvent.type, null, 'ambient events remain infrequent during the cooldown');
}
for (let index = 0; index < 15 && ambientEvent.type === null; index++) {
  ambientEvent = ambientEvents.update(0.08);
}
assert.equal(ambientEvent.type, 'sign-flicker', 'another event can begin after the long cooldown');

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
assert.ok(combined.cityLight > 0 && combined.bassReflection > 0 && combined.energyMotion > 0,
  'moderate combined music activates distinct scene channels');

const malformed = settle({
  volume: Number.NaN,
  bass: Number.POSITIVE_INFINITY,
  mid: -2,
  high: 5,
  energy: Number.NaN,
  beat: false,
  beatStrength: 1,
});
assert.equal(malformed.cityLight, 0, 'non-finite audio values are treated as silence');
assert.equal(malformed.bassReflection, 0, 'non-finite audio values are treated as silence');
assert.equal(malformed.midMotion, 0, 'negative audio values are treated as silence');
assert.ok(malformed.highDetail > 0.99 && malformed.highDetail <= 1, 'values above one approach the clamped maximum');
assert.equal(malformed.beatPulse, 0, 'malformed beat strength alone cannot create a ripple');

const canvasCalls = [];
const gradient = { addColorStop() {} };
const createContext = () => new Proxy({
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
}, {
  get(target, property) {
    if (property in target) return target[property];
    return (...args) => canvasCalls.push({ method: property, args });
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
const { NeonRainEnvironment } = require('../tmp/scene-test/app/neon-rain.environment.js');
const canvas = new TestCanvas();
const environment = new NeonRainEnvironment(canvas);
environment.start();
environment.resize(960, 540);

const drops = environment.drops;
const motes = environment.motes;
const dropCount = drops.length;
const moteCount = motes.length;
const layerSpeeds = [0, 1, 2].map((layer) => {
  const layerDrops = drops.filter((drop) => drop.layer === layer);
  return layerDrops.reduce((total, drop) => total + drop.speed, 0) / layerDrops.length;
});
assert.ok(layerSpeeds[0] < layerSpeeds[1] && layerSpeeds[1] < layerSpeeds[2],
  'far, middle, and foreground rain layers move at increasing speeds');

const initialDropPositions = drops.map(({ x, y }) => [x, y]);
const initialMotePositions = motes.map(({ x, y }) => [x, y]);
for (let index = 0; index < 120; index++) environment.update(silence(), 1 / 30);
assert.ok(drops.some((drop, index) => drop.x !== initialDropPositions[index][0] || drop.y !== initialDropPositions[index][1]),
  'rain keeps moving during silence');
assert.ok(motes.some((mote, index) => mote.x !== initialMotePositions[index][0] || mote.y !== initialMotePositions[index][1]),
  'foreground motes drift during silence');
assert.equal(drops.length, dropCount, 'audio and ambient motion do not add rain particles');
assert.equal(motes.length, moteCount, 'audio and ambient motion do not add mote particles');
assert.equal(canvasCalls.filter(({ method }) => method === 'ellipse').length, 0,
  'silence does not draw a beat ripple');

canvasCalls.length = 0;
environment.update({ ...silence(), beat: true, beatStrength: 0.8 }, 1 / 30);
assert.equal(canvasCalls.filter(({ method }) => method === 'ellipse').length, 2,
  'a beat draws the paired road ripples');
environment.stop();

console.log('Neon Rain scene response checks passed: independent channels, nonlinear response, beat ripple and decay, ambient event timing, silent-scene motion, layered rain, fixed particle counts, and input bounds.');
