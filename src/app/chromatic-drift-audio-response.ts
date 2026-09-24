import { AudioReactiveFrame } from './audio-reactive-frame';

export interface ChromaticDriftResponseFrame {
  ribbonVisibility: number;
  volumeGlow: number;
  bassWidth: number;
  midRipple: number;
  highGlint: number;
  energyDrift: number;
  beatPulse: number;
  beatProgress: number;
}

const NEAR_SILENCE_THRESHOLD = 0.04;
const RESPONSE_SILENCE_EPSILON = 0.002;
const BEAT_VISIBLE_DURATION = 0.6;
const BEAT_DECAY_SECONDS = 0.19;

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const responseCurve = (value: number, exponent: number): number => {
  const normalized = clamp01(value);
  if (normalized <= NEAR_SILENCE_THRESHOLD) return 0;
  return Math.pow((normalized - NEAR_SILENCE_THRESHOLD) / (1 - NEAR_SILENCE_THRESHOLD), exponent);
};

const smooth = (current: number, target: number, dt: number): number => {
  const seconds = target > current ? 0.12 : 0.32;
  const next = current + (target - current) * (1 - Math.exp(-dt / seconds));
  return target === 0 && next < RESPONSE_SILENCE_EPSILON ? 0 : next;
};

/** Maps normalized audio into separate, bounded controls for Chromatic Drift. */
export class ChromaticDriftAudioResponse {
  private volumeGlow = 0;
  private bassWidth = 0;
  private midRipple = 0;
  private highGlint = 0;
  private energyDrift = 0;
  private beatPulse = 0;
  private beatAge = BEAT_VISIBLE_DURATION;
  private beatWasActive = false;

  update(frame: AudioReactiveFrame, deltaTime: number): ChromaticDriftResponseFrame {
    const dt = Math.min(0.08, Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0));
    this.volumeGlow = smooth(this.volumeGlow, responseCurve(frame.volume, 0.78), dt);
    this.bassWidth = smooth(this.bassWidth, responseCurve(frame.bass, 0.64), dt);
    this.midRipple = smooth(this.midRipple, responseCurve(frame.mid, 0.72), dt);
    this.highGlint = smooth(this.highGlint, responseCurve(frame.high, 0.78), dt);
    this.energyDrift = smooth(this.energyDrift, responseCurve(frame.energy, 0.7), dt);

    const beatStarted = frame.beat && !this.beatWasActive;
    if (beatStarted) {
      this.beatPulse = Math.max(this.beatPulse, responseCurve(frame.beatStrength, 0.62));
      this.beatAge = 0;
    } else {
      this.beatAge += dt;
      this.beatPulse *= Math.exp(-dt / BEAT_DECAY_SECONDS);
    }
    this.beatWasActive = frame.beat;

    if (this.beatAge >= BEAT_VISIBLE_DURATION) this.beatPulse = 0;

    const visibility = Math.max(
      this.volumeGlow,
      this.bassWidth,
      this.midRipple,
      this.highGlint,
      this.energyDrift,
      this.beatPulse,
    );

    return {
      ribbonVisibility: clamp01(visibility),
      volumeGlow: clamp01(this.volumeGlow),
      bassWidth: clamp01(this.bassWidth),
      midRipple: clamp01(this.midRipple),
      highGlint: clamp01(this.highGlint),
      energyDrift: clamp01(this.energyDrift),
      beatPulse: clamp01(this.beatPulse),
      beatProgress: clamp01(this.beatAge / BEAT_VISIBLE_DURATION),
    };
  }
}
