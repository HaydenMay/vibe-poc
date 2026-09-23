import { AudioReactiveFrame, EMPTY_AUDIO_FRAME } from './audio-reactive-frame';

declare global {
  interface Window {
    livelyAudioListener?: (audioArray: unknown) => void;
    livelyWallpaperPlaybackChanged?: (data: unknown) => void;
  }
}

export interface LivelyAudioDiagnostics {
  rawPeak: number;
  rawAverage: number;
  callbacks: number;
  paused: boolean;
}

const SILENCE_FLOOR = 0.008;
const MAX_RAW_VALUE = 64;
const MAX_INPUT_LENGTH = 512;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export class LivelyAudioProvider {
  private frameValue: AudioReactiveFrame = { ...EMPTY_AUDIO_FRAME };
  private rawBass = 0;
  private rawMid = 0;
  private rawHigh = 0;
  private rawRms = 0;
  private rawPeakValue = 0;
  private rawAverageValue = 0;
  private lastAudioTime = -Infinity;
  private lastUpdateTime = 0;
  private peakEnvelope = 0.12;
  private baselineEnergy = 0;
  private baselineBass = 0;
  private lastBeatTime = -Infinity;
  private beatUntil = 0;
  private peakBeatStrength = 0;
  private callbackCount = 0;
  private paused = false;
  private started = false;
  private targetWindow: Window | null = null;
  private previousAudioListener: Window['livelyAudioListener'];
  private previousPlaybackListener: Window['livelyWallpaperPlaybackChanged'];
  private audioListener: ((audioArray: unknown) => void) | null = null;
  private playbackListener: ((data: unknown) => void) | null = null;
  private onPaused: ((paused: boolean) => void) | null = null;

  get frame(): AudioReactiveFrame {
    return this.frameValue;
  }

  get diagnostics(): LivelyAudioDiagnostics {
    return {
      rawPeak: this.rawPeakValue,
      rawAverage: this.rawAverageValue,
      callbacks: this.callbackCount,
      paused: this.paused,
    };
  }

  start(onPaused?: (paused: boolean) => void, targetWindow: Window = window): void {
    if (this.started) return;
    this.started = true;
    this.onPaused = onPaused ?? null;
    this.targetWindow = targetWindow;
    this.previousAudioListener = targetWindow.livelyAudioListener;
    this.previousPlaybackListener = targetWindow.livelyWallpaperPlaybackChanged;
    this.audioListener = (audioArray) => this.receiveAudio(audioArray, performance.now());
    this.playbackListener = (data) => this.receivePlaybackState(data);
    targetWindow.livelyAudioListener = this.audioListener;
    targetWindow.livelyWallpaperPlaybackChanged = this.playbackListener;
  }

  stop(): void {
    if (this.targetWindow && this.audioListener && this.targetWindow.livelyAudioListener === this.audioListener) {
      if (this.previousAudioListener) this.targetWindow.livelyAudioListener = this.previousAudioListener;
      else delete this.targetWindow.livelyAudioListener;
    }
    if (this.targetWindow && this.playbackListener && this.targetWindow.livelyWallpaperPlaybackChanged === this.playbackListener) {
      if (this.previousPlaybackListener) this.targetWindow.livelyWallpaperPlaybackChanged = this.previousPlaybackListener;
      else delete this.targetWindow.livelyWallpaperPlaybackChanged;
    }
    this.targetWindow = null;
    this.audioListener = null;
    this.playbackListener = null;
    this.onPaused = null;
    this.started = false;
    this.paused = false;
    this.reset();
  }

  receiveAudio(audioArray: unknown, time = performance.now()): void {
    if (this.paused) return;
    try {
      this.readAudio(audioArray, time);
    } catch {
      this.clearRawSignal(time);
    }
  }

  private readAudio(audioArray: unknown, time: number): void {
    if (!Array.isArray(audioArray) && !ArrayBuffer.isView(audioArray)) {
      this.clearRawSignal(time);
      return;
    }

    const values = audioArray as ArrayLike<unknown>;
    const length = Number.isSafeInteger(values.length) ? values.length : 0;
    if (length < 1 || length > MAX_INPUT_LENGTH) {
      this.clearRawSignal(time);
      return;
    }

    const bassEnd = Math.max(1, Math.floor(length * 0.125));
    const midEnd = Math.max(bassEnd + 1, Math.floor(length * 0.44));
    let bassSquares = 0;
    let midSquares = 0;
    let highSquares = 0;
    let allSquares = 0;
    let peak = 0;
    let sum = 0;

    for (let index = 0; index < length; index++) {
      const item = values[index];
      const sample = typeof item === 'number' && Number.isFinite(item)
        ? Math.min(MAX_RAW_VALUE, Math.max(0, item))
        : 0;
      const square = sample * sample;
      allSquares += square;
      sum += sample;
      if (sample > peak) peak = sample;
      if (index < bassEnd) bassSquares += square;
      else if (index < midEnd) midSquares += square;
      else highSquares += square;
    }

    const midCount = Math.max(1, Math.min(length, midEnd) - bassEnd);
    const highCount = Math.max(1, length - midEnd);
    this.rawBass = Math.sqrt(bassSquares / bassEnd);
    this.rawMid = Math.sqrt(midSquares / midCount);
    this.rawHigh = Math.sqrt(highSquares / highCount);
    this.rawRms = Math.sqrt(allSquares / length);
    this.rawPeakValue = peak;
    this.rawAverageValue = sum / length;
    this.lastAudioTime = time;
    this.callbackCount++;
  }

  update(time: number): AudioReactiveFrame {
    const elapsed = this.lastUpdateTime ? Math.max(0, Math.min(0.1, (time - this.lastUpdateTime) / 1000)) : 1 / 60;
    this.lastUpdateTime = time;
    const signalIsFresh = time - this.lastAudioTime < 250;
    const observedPeak = signalIsFresh ? this.rawPeakValue : 0;
    const envelopeAlpha = 1 - Math.exp(-elapsed / (observedPeak > this.peakEnvelope ? 0.055 : 2.4));
    this.peakEnvelope += (observedPeak - this.peakEnvelope) * envelopeAlpha;

    const normalizationReference = Math.max(0.08, this.peakEnvelope * 1.55);
    const mapLevel = (magnitude: number): number => {
      if (!signalIsFresh || observedPeak < SILENCE_FLOOR) return 0;
      const adaptiveLevel = Math.pow(clamp01(magnitude / normalizationReference), 0.72);
      const amplitudeLevel = Math.sqrt(clamp01(magnitude));
      return adaptiveLevel * 0.55 + amplitudeLevel * 0.45;
    };
    const targetBass = mapLevel(this.rawBass);
    const targetMid = mapLevel(this.rawMid);
    const targetHigh = mapLevel(this.rawHigh);
    const targetVolume = mapLevel(this.rawRms);
    const energyTarget = clamp01(targetVolume * 0.28 + targetBass * 0.3 + targetMid * 0.27 + targetHigh * 0.15);

    const rawEnergy = (this.rawRms * 0.28 + this.rawBass * 0.3 + this.rawMid * 0.27 + this.rawHigh * 0.15);
    const bassRise = (this.rawBass - this.baselineBass) / (this.baselineBass + 0.015);
    const energyRise = (rawEnergy - this.baselineEnergy) / (this.baselineEnergy + 0.018);
    const rise = Math.max(bassRise, energyRise);
    if (signalIsFresh && observedPeak >= SILENCE_FLOOR && energyTarget > 0.14 && rise > 0.55 && time - this.lastBeatTime > 190) {
      this.lastBeatTime = time;
      this.beatUntil = time + 115;
      this.peakBeatStrength = clamp01(0.22 + rise * 0.38);
    }

    const baselineAlpha = 1 - Math.exp(-elapsed / 1.0);
    this.baselineBass += (this.rawBass - this.baselineBass) * baselineAlpha;
    this.baselineEnergy += (rawEnergy - this.baselineEnergy) * baselineAlpha;

    const previous = this.frameValue;
    const smooth = (oldValue: number, nextValue: number): number => {
      const alpha = 1 - Math.exp(-elapsed / (nextValue > oldValue ? 0.075 : 0.24));
      return oldValue + (nextValue - oldValue) * alpha;
    };
    const energyAlpha = 1 - Math.exp(-elapsed / (energyTarget > previous.energy ? 0.32 : 0.85));
    this.frameValue = {
      volume: smooth(previous.volume, targetVolume),
      bass: smooth(previous.bass, targetBass),
      mid: smooth(previous.mid, targetMid),
      high: smooth(previous.high, targetHigh),
      energy: previous.energy + (energyTarget - previous.energy) * energyAlpha,
      beat: time < this.beatUntil,
      beatStrength: this.peakBeatStrength * Math.max(0, 1 - (time - this.lastBeatTime) / 380),
    };
    return this.frameValue;
  }

  private receivePlaybackState(data: unknown): void {
    let state = data;
    if (typeof state === 'string') {
      try {
        state = JSON.parse(state) as unknown;
      } catch {
        return;
      }
    }
    if (typeof state !== 'object' || state === null || !('IsPaused' in state)) return;
    const paused = (state as { IsPaused?: unknown }).IsPaused === true;
    if (paused === this.paused) return;
    this.paused = paused;
    this.onPaused?.(paused);
  }

  private clearRawSignal(time: number): void {
    this.rawBass = 0;
    this.rawMid = 0;
    this.rawHigh = 0;
    this.rawRms = 0;
    this.rawPeakValue = 0;
    this.rawAverageValue = 0;
    this.lastAudioTime = time;
    this.callbackCount++;
  }

  private reset(): void {
    this.frameValue = { ...EMPTY_AUDIO_FRAME };
    this.rawBass = 0;
    this.rawMid = 0;
    this.rawHigh = 0;
    this.rawRms = 0;
    this.rawPeakValue = 0;
    this.rawAverageValue = 0;
    this.lastAudioTime = -Infinity;
    this.lastUpdateTime = 0;
    this.peakEnvelope = 0.12;
    this.baselineEnergy = 0;
    this.baselineBass = 0;
    this.lastBeatTime = -Infinity;
    this.beatUntil = 0;
    this.peakBeatStrength = 0;
    this.callbackCount = 0;
  }
}
