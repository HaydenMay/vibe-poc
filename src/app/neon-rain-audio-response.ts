import { AudioReactiveFrame } from './audio-reactive-frame';

export interface NeonRainAudioResponseFrame {
  cityLight: number;
  bassReflection: number;
  midMotion: number;
  highDetail: number;
  energyMotion: number;
  beatPulse: number;
  beatProgress: number;
}

const BEAT_VISIBLE_DURATION = 0.6;
const BEAT_DECAY_SECONDS = 0.19;

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const responseCurve = (value: number, exponent: number): number =>
  Math.pow(clamp01(value), exponent);

const smooth = (current: number, target: number, dt: number): number => {
  const seconds = target > current ? 0.11 : 0.38;
  return current + (target - current) * (1 - Math.exp(-dt / seconds));
};

/** Converts normalized audio readings into bounded, scene-specific visual controls. */
export class NeonRainAudioResponse {
  private cityLight = 0;
  private bassReflection = 0;
  private midMotion = 0;
  private highDetail = 0;
  private energyMotion = 0;
  private beatPulse = 0;
  private beatAge = BEAT_VISIBLE_DURATION;
  private beatWasActive = false;

  update(frame: AudioReactiveFrame, deltaTime: number): NeonRainAudioResponseFrame {
    const dt = Math.min(0.08, Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0));
    this.cityLight = smooth(this.cityLight, responseCurve(frame.volume, 0.8), dt);
    this.bassReflection = smooth(this.bassReflection, responseCurve(frame.bass, 0.65), dt);
    this.midMotion = smooth(this.midMotion, responseCurve(frame.mid, 0.75), dt);
    this.highDetail = smooth(this.highDetail, responseCurve(frame.high, 0.8), dt);
    this.energyMotion = smooth(this.energyMotion, responseCurve(frame.energy, 0.75), dt);

    const beatStarted = frame.beat && !this.beatWasActive;
    if (beatStarted) {
      this.beatPulse = Math.max(this.beatPulse, responseCurve(frame.beatStrength, 0.65));
      this.beatAge = 0;
    } else {
      this.beatAge += dt;
      this.beatPulse *= Math.exp(-dt / BEAT_DECAY_SECONDS);
    }
    this.beatWasActive = frame.beat;

    if (this.beatAge >= BEAT_VISIBLE_DURATION) this.beatPulse = 0;

    return {
      cityLight: clamp01(this.cityLight),
      bassReflection: clamp01(this.bassReflection),
      midMotion: clamp01(this.midMotion),
      highDetail: clamp01(this.highDetail),
      energyMotion: clamp01(this.energyMotion),
      beatPulse: clamp01(this.beatPulse),
      beatProgress: clamp01(this.beatAge / BEAT_VISIBLE_DURATION),
    };
  }
}
