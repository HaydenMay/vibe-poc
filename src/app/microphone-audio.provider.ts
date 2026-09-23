import { AudioReactiveFrame, EMPTY_AUDIO_FRAME } from './audio-reactive-frame';

export type AudioSessionMode = 'auto' | 'play-and-record';
export type MicrophoneStatus = 'idle' | 'requesting' | 'listening' | 'stopped' | 'error';
type AudioSessionLike = { type: string };

export interface MicrophoneDiagnostics {
  contextState: string;
  sampleRate: number | null;
  trackState: string;
  trackSettings: string;
  audioSessionAvailable: boolean;
  audioSessionType: string;
  requestedAudioSessionMode: AudioSessionMode;
  sessionSetResult: string;
  sessionSetError: string;
  sessionRestoreResult: string;
  sessionRestoreError: string;
  sessionReadError: string;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export class MicrophoneAudioProvider {
  status: MicrophoneStatus = 'idle';
  error = '';

  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private animationId: number | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private timeData: Float32Array<ArrayBuffer> | null = null;
  private startToken = 0;
  private lastFrameTime = 0;
  private lastDiagnosticTime = 0;
  private baselineBass = 0;
  private baselineVolume = 0;
  private lastBeatTime = -Infinity;
  private beatUntil = 0;
  private peakBeatStrength = 0;
  private frameValue: AudioReactiveFrame = { ...EMPTY_AUDIO_FRAME };
  private destroyed = false;
  private requestedMode: AudioSessionMode = 'auto';
  private diagnosticValues: MicrophoneDiagnostics = {
    contextState: 'not created',
    sampleRate: null,
    trackState: 'not acquired',
    trackSettings: 'not acquired',
    audioSessionAvailable: false,
    audioSessionType: 'unavailable',
    requestedAudioSessionMode: 'auto',
    sessionSetResult: 'not attempted (Auto)',
    sessionSetError: '',
    sessionRestoreResult: 'not attempted',
    sessionRestoreError: '',
    sessionReadError: '',
  };

  constructor(private readonly onStatusChange: (status: MicrophoneStatus, message: string) => void) {
    this.updateAudioSessionDiagnostic();
  }

  get frame(): AudioReactiveFrame {
    return this.frameValue;
  }

  get diagnostics(): MicrophoneDiagnostics {
    return { ...this.diagnosticValues };
  }

  setRequestedAudioSessionMode(mode: AudioSessionMode): void {
    this.requestedMode = mode;
    this.diagnosticValues.requestedAudioSessionMode = mode;
    this.diagnosticValues.sessionSetResult = mode === 'auto' ? 'not attempted (Auto)' : 'not attempted';
    this.diagnosticValues.sessionSetError = '';
  }

  async start(): Promise<void> {
    if (this.destroyed || this.status === 'requesting' || this.status === 'listening') return;
    const token = ++this.startToken;
    this.error = '';
    this.diagnosticValues.sessionSetResult = this.requestedMode === 'auto' ? 'not attempted (Auto)' : 'not attempted';
    this.diagnosticValues.sessionSetError = '';
    this.diagnosticValues.sessionRestoreResult = 'not attempted';
    this.diagnosticValues.sessionRestoreError = '';
    this.diagnosticValues.sampleRate = null;
    this.diagnosticValues.trackState = 'not acquired';
    this.diagnosticValues.trackSettings = 'not acquired';
    this.diagnosticValues.contextState = 'not created';
    this.status = 'requesting';
    this.onStatusChange(this.status, 'Waiting for microphone permission…');
    this.updateAudioSessionDiagnostic();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is unavailable. Open this page over HTTPS in Safari.');
      }
      if (this.requestedMode === 'play-and-record') this.setAudioSessionType('play-and-record', 'start');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (this.destroyed || token !== this.startToken) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('No microphone audio track was returned.');
      track.addEventListener('ended', this.onTrackEnded);
      this.diagnosticValues.trackState = track.readyState;
      this.diagnosticValues.trackSettings = JSON.stringify(track.getSettings(), null, 2);

      const context = new AudioContext();
      this.context = context;
      context.addEventListener('statechange', this.onContextStateChange);
      this.diagnosticValues.sampleRate = context.sampleRate;
      this.diagnosticValues.contextState = context.state;

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.35;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      source.connect(analyser); // Analysis only; never connect the microphone to destination.
      this.source = source;
      this.analyser = analyser;
      this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
      this.timeData = new Float32Array(analyser.fftSize);

      if (context.state === 'suspended') await context.resume();
      if (this.destroyed || token !== this.startToken) return;
      this.diagnosticValues.contextState = context.state;
      this.updateAudioSessionDiagnostic();
      this.resetAnalysis();
      this.status = 'listening';
      this.onStatusChange(this.status, 'Listening to the room.');
      this.animationId = requestAnimationFrame(this.analyze);
    } catch (cause) {
      if (this.destroyed || token !== this.startToken) return;
      this.releaseAudio();
      this.status = 'error';
      this.error = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
      this.onStatusChange(this.status, 'Could not start microphone capture.');
    }
  }

  stop(): void {
    ++this.startToken;
    this.releaseAudio();
    this.status = 'stopped';
    this.error = '';
    this.onStatusChange(this.status, 'The rain is still here. Start Vibe to listen again.');
  }

  destroy(): void {
    this.destroyed = true;
    ++this.startToken;
    this.releaseAudio();
  }

  private readonly onTrackEnded = (): void => {
    if (this.status !== 'listening') return;
    this.releaseAudio();
    this.status = 'stopped';
    this.onStatusChange(this.status, 'The microphone track ended. Tap Start Listening to try again.');
  };

  private readonly onContextStateChange = (): void => {
    this.diagnosticValues.contextState = this.context?.state ?? 'closed';
  };

  private readonly analyze = (time: number): void => {
    const analyser = this.analyser;
    const context = this.context;
    const frequencies = this.frequencyData;
    const samples = this.timeData;
    if (this.status !== 'listening' || !analyser || !context || !frequencies || !samples) return;
    analyser.getFloatTimeDomainData(samples);
    analyser.getByteFrequencyData(frequencies);

    let squares = 0;
    for (const sample of samples) squares += sample * sample;
    const rawVolume = clamp01(Math.sqrt(squares / samples.length) * 5);
    const rawBass = this.bandLevel(frequencies, context.sampleRate, analyser.fftSize, 20, 250);
    const rawMid = this.bandLevel(frequencies, context.sampleRate, analyser.fftSize, 250, 2000);
    const rawHigh = this.bandLevel(frequencies, context.sampleRate, analyser.fftSize, 2000, 8000);

    const elapsed = this.lastFrameTime ? Math.min(0.1, (time - this.lastFrameTime) / 1000) : 1 / 60;
    this.lastFrameTime = time;
    const baselineAlpha = 1 - Math.exp(-elapsed / 1.1);
    const bassRise = (rawBass - this.baselineBass) / (this.baselineBass + 0.08);
    const volumeRise = (rawVolume - this.baselineVolume) / (this.baselineVolume + 0.06);
    const rise = Math.max(bassRise, volumeRise);
    if ((rawBass > 0.14 || rawVolume > 0.1) && rise > 0.55 && time - this.lastBeatTime > 220) {
      this.lastBeatTime = time;
      this.beatUntil = time + 110;
      this.peakBeatStrength = clamp01((rise - 0.55) / 1.5 + 0.25);
    }
    this.baselineBass += (rawBass - this.baselineBass) * baselineAlpha;
    this.baselineVolume += (rawVolume - this.baselineVolume) * baselineAlpha;

    const previous = this.frameValue;
    const smooth = (oldValue: number, nextValue: number): number => {
      const alpha = 1 - Math.exp(-elapsed / (nextValue > oldValue ? 0.07 : 0.2));
      return oldValue + (nextValue - oldValue) * alpha;
    };
    const energyTarget = clamp01(rawVolume * 0.55 + rawBass * 0.2 + rawMid * 0.2 + rawHigh * 0.05);
    this.frameValue = {
      volume: smooth(previous.volume, rawVolume),
      bass: smooth(previous.bass, rawBass),
      mid: smooth(previous.mid, rawMid),
      high: smooth(previous.high, rawHigh),
      energy: previous.energy + (energyTarget - previous.energy) * (1 - Math.exp(-elapsed / (energyTarget > previous.energy ? 0.45 : 1.15))),
      beat: time < this.beatUntil,
      beatStrength: this.peakBeatStrength * Math.max(0, 1 - (time - this.lastBeatTime) / 380),
    };

    if (time - this.lastDiagnosticTime > 500) {
      this.lastDiagnosticTime = time;
      this.diagnosticValues.contextState = context.state;
      this.diagnosticValues.trackState = this.stream?.getAudioTracks()[0]?.readyState ?? 'ended';
      this.updateAudioSessionDiagnostic();
    }
    this.animationId = requestAnimationFrame(this.analyze);
  };

  private bandLevel(data: Uint8Array<ArrayBuffer>, sampleRate: number, fftSize: number, lowHz: number, highHz: number): number {
    const lowBin = Math.max(1, Math.ceil((lowHz * fftSize) / sampleRate));
    const highBin = Math.min(data.length - 1, Math.floor((highHz * fftSize) / sampleRate));
    if (highBin < lowBin) return 0;
    let squares = 0;
    for (let bin = lowBin; bin <= highBin; bin++) {
      const level = clamp01((data[bin] - 55) / 150);
      squares += level * level;
    }
    return clamp01(Math.sqrt(squares / (highBin - lowBin + 1)));
  }

  private updateAudioSessionDiagnostic(): void {
    try {
      const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
      this.diagnosticValues.audioSessionAvailable = Boolean(session);
      this.diagnosticValues.audioSessionType = session?.type ?? 'unavailable';
      this.diagnosticValues.sessionReadError = '';
    } catch (cause) {
      this.diagnosticValues.audioSessionAvailable = false;
      this.diagnosticValues.audioSessionType = 'unavailable';
      this.diagnosticValues.sessionReadError = this.errorMessage(cause);
    }
  }

  private setAudioSessionType(type: AudioSessionMode, phase: 'start' | 'restore'): void {
    const resultKey = phase === 'start' ? 'sessionSetResult' : 'sessionRestoreResult';
    const errorKey = phase === 'start' ? 'sessionSetError' : 'sessionRestoreError';
    try {
      const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
      if (!session) {
        this.diagnosticValues[resultKey] = 'unavailable';
        return;
      }
      session.type = type;
      this.diagnosticValues[resultKey] = session.type === type ? 'succeeded' : 'failed (readback differs)';
      this.updateAudioSessionDiagnostic();
    } catch (cause) {
      this.diagnosticValues[resultKey] = 'failed';
      this.diagnosticValues[errorKey] = this.errorMessage(cause);
      this.updateAudioSessionDiagnostic();
    }
  }

  private errorMessage(cause: unknown): string {
    return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  }

  private resetAnalysis(): void {
    this.frameValue = { ...EMPTY_AUDIO_FRAME };
    this.lastFrameTime = 0;
    this.lastDiagnosticTime = 0;
    this.baselineBass = 0;
    this.baselineVolume = 0;
    this.lastBeatTime = -Infinity;
    this.beatUntil = 0;
    this.peakBeatStrength = 0;
  }

  private releaseAudio(): void {
    const hadContext = Boolean(this.context);
    const hadStream = Boolean(this.stream);
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.source = null;
    this.analyser = null;
    this.frequencyData = null;
    this.timeData = null;
    for (const track of this.stream?.getTracks() ?? []) {
      track.removeEventListener('ended', this.onTrackEnded);
      track.stop();
    }
    this.stream = null;
    if (this.context) {
      this.context.removeEventListener('statechange', this.onContextStateChange);
      void this.context.close().catch(() => undefined);
    }
    this.context = null;
    this.diagnosticValues.contextState = hadContext ? 'closed' : 'not created';
    this.diagnosticValues.trackState = hadStream ? 'ended' : 'not acquired';
    this.resetAnalysis();
    this.setAudioSessionType('auto', 'restore');
    this.updateAudioSessionDiagnostic();
  }
}
