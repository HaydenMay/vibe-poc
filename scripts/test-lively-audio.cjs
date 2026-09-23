const assert = require('node:assert/strict');
const { LivelyAudioProvider } = require('../tmp/lively-test/app/lively-audio.provider.js');

let microphoneRequests = 0;
Object.defineProperty(global, 'navigator', {
  configurable: true,
  value: { mediaDevices: { getUserMedia: () => microphoneRequests++ } },
});

const step = (provider, values, time, count = 1) => {
  let frame;
  for (let index = 0; index < count; index++) {
    const now = time + index * 34;
    provider.receiveAudio(values, now);
    frame = { ...provider.update(now) };
  }
  return frame;
};

const fillBins = (start, end, value) => {
  const result = new Array(128).fill(0);
  for (let index = start; index < end; index++) result[index] = value;
  return result;
};

const fakeWindow = {};
let pauseChanges = [];
const provider = new LivelyAudioProvider();
provider.start((paused) => pauseChanges.push(paused), fakeWindow);
assert.equal(typeof fakeWindow.livelyAudioListener, 'function', 'listener is assigned on the window global');
assert.equal(typeof fakeWindow.livelyWallpaperPlaybackChanged, 'function', 'pause callback is assigned on the window global');

const silence = new Array(128).fill(0);
let frame = step(provider, silence, 0, 40);
assert.equal(frame.energy, 0, 'silence starts settled');
assert.equal(frame.beat, false, 'silence does not trigger a beat');

const quietProvider = new LivelyAudioProvider();
const quietFrame = step(quietProvider, fillBins(0, 16, 0.03), 0, 40);
assert.ok(quietFrame.bass >= 0.1 && quietFrame.bass <= 0.45, `quiet input stays visible without saturating (got ${quietFrame.bass.toFixed(2)})`);

const bass = fillBins(0, 16, 0.18);
frame = step(provider, bass, 1400, 40);
assert.ok(frame.bass >= 0.3 && frame.bass <= 0.7, `normal bass input should use the middle of the range (got ${frame.bass.toFixed(2)})`);
assert.ok(frame.bass > frame.high, 'low ordered bins affect bass more than high');
assert.ok(frame.energy > 0.1, 'bass input raises overall energy');

const energeticProvider = new LivelyAudioProvider();
const energeticFrame = step(energeticProvider, fillBins(0, 16, 0.55), 0, 40);
assert.ok(energeticFrame.bass >= 0.55 && energeticFrame.bass <= 0.9, `energetic input remains strong but below saturation (got ${energeticFrame.bass.toFixed(2)})`);

const mids = fillBins(16, 56, 0.18);
frame = step(provider, mids, 2800, 40);
assert.ok(frame.mid > 0.35, `middle ordered bins affect mid (got ${frame.mid.toFixed(2)})`);
assert.ok(frame.mid > frame.bass, 'middle bins do not affect bass');

const treble = fillBins(56, 128, 0.18);
frame = step(provider, treble, 4200, 40);
assert.ok(frame.high > 0.35, `upper ordered bins affect high (got ${frame.high.toFixed(2)})`);
assert.ok(frame.high > frame.bass, 'upper bins do not affect bass');

step(provider, fillBins(0, 16, 0.06), 5600, 42);
frame = step(provider, fillBins(0, 16, 0.5), 7050);
assert.equal(frame.beat, true, 'a sudden energy and bass rise triggers a beat');
assert.ok(frame.beatStrength > 0.2, 'transient has useful strength');

const malformed = [Number.NaN, Number.POSITIVE_INFINITY, -4, 1e100, 'noise'];
assert.doesNotThrow(() => step(provider, malformed, 7100, 4), 'malformed values do not throw');
const unreadableArray = new Proxy([], { get: () => { throw new Error('unreadable input'); } });
assert.doesNotThrow(() => step(provider, unreadableArray, 7250), 'unreadable array-like values do not throw');
frame = { ...provider.frame };
for (const key of ['volume', 'bass', 'mid', 'high', 'energy', 'beatStrength']) {
  assert.ok(Number.isFinite(frame[key]) && frame[key] >= 0 && frame[key] <= 1, `${key} stays finite and bounded`);
}
assert.doesNotThrow(() => step(provider, new Array(700).fill(1), 7400, 4), 'unexpected array sizes do not throw');
frame = step(provider, silence, 7600, 80);
assert.ok(frame.energy < 0.05, `silence settles after playback (got ${frame.energy.toFixed(2)})`);

fakeWindow.livelyWallpaperPlaybackChanged('{"IsPaused":true}');
assert.deepEqual(pauseChanges, [true], 'pause message notifies the renderer once');
const callbacksBeforePause = provider.diagnostics.callbacks;
fakeWindow.livelyAudioListener(bass);
assert.equal(provider.diagnostics.callbacks, callbacksBeforePause, 'audio is ignored while paused');
fakeWindow.livelyWallpaperPlaybackChanged({ IsPaused: false });
assert.deepEqual(pauseChanges, [true, false], 'resume message notifies the renderer');

const activeListener = fakeWindow.livelyAudioListener;
provider.start(() => pauseChanges.push(false), fakeWindow);
assert.equal(fakeWindow.livelyAudioListener, activeListener, 'repeated start does not add another callback');
provider.stop();
assert.equal('livelyAudioListener' in fakeWindow, false, 'stop removes the installed global listener');
assert.equal('livelyWallpaperPlaybackChanged' in fakeWindow, false, 'stop removes the installed pause listener');
assert.equal(microphoneRequests, 0, 'the Lively provider never requests microphone access');

console.log('Lively audio provider checks passed: callback, bands, sensitivity, transient, silence, malformed input, lifecycle, pause, and no microphone access.');
