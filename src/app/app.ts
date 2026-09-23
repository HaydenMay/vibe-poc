import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { AudioReactiveFrame, EMPTY_AUDIO_FRAME } from './audio-reactive-frame';
import { NeonRainEnvironment } from './neon-rain.environment';
import { VibeEnvironment } from './vibe-environment';

type CaptureStatus = 'idle' | 'requesting' | 'listening' | 'stopped' | 'error';
type AudioSessionMode = 'auto' | 'play-and-record';
type AudioSessionLike = { type: string };

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('sceneCanvas', { static: true }) private sceneCanvas!: ElementRef<HTMLCanvasElement>;

  readonly frame = signal<AudioReactiveFrame>(EMPTY_AUDIO_FRAME);
  readonly debugVisible = signal(false);
  readonly fps = signal(0);
  readonly status = signal<CaptureStatus>('idle');
  readonly message = signal('An atmosphere shaped by the sound around you.');
  readonly error = signal('');
  readonly contextState = signal('not created');
  readonly sampleRate = signal<number | null>(null);
  readonly trackState = signal('not acquired');
  readonly trackSettings = signal('not acquired');
  readonly audioSessionAvailable = signal(false);
  readonly audioSessionType = signal('unavailable');
  readonly requestedAudioSessionMode = signal<AudioSessionMode>('auto');
  readonly sessionSetResult = signal('not attempted (Auto)');
  readonly sessionSetError = signal('');
  readonly sessionRestoreResult = signal('not attempted');
  readonly sessionRestoreError = signal('');
  readonly sessionReadError = signal('');

  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private animationId: number | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private timeData: Float32Array<ArrayBuffer> | null = null;
  private startToken = 0;
  private destroyed = false;
  private lastFrameTime = 0;
  private lastDiagnosticTime = 0;
  private baselineBass = 0;
  private baselineVolume = 0;
  private lastBeatTime = -Infinity;
  private beatUntil = 0;
  private peakBeatStrength = 0;
  private environment: VibeEnvironment | null = null;
  private sceneAnimationId: number | null = null;
  private lastSceneFrame = 0;
  private fpsWindowStart = 0;
  private renderedFrames = 0;

  constructor() {
    this.updateAudioSessionDiagnostic();
  }

  ngAfterViewInit(): void {
    try {
      this.environment = new NeonRainEnvironment(this.sceneCanvas.nativeElement);
      this.environment.start();
      this.resizeEnvironment();
      window.addEventListener('resize', this.resizeEnvironment);
      window.visualViewport?.addEventListener('resize', this.resizeEnvironment);
      this.sceneAnimationId = requestAnimationFrame(this.renderScene);
    } catch (cause) {
      this.error.set(`Visual environment: ${this.errorMessage(cause)}`);
    }
  }

  toggleDebug(): void {
    this.debugVisible.update((visible) => !visible);
  }

  private readonly resizeEnvironment = (): void => {
    this.environment?.resize(window.innerWidth, window.innerHeight);
  };

  private readonly renderScene = (time: number): void => {
    this.sceneAnimationId = requestAnimationFrame(this.renderScene);
    if (this.lastSceneFrame && time - this.lastSceneFrame < 1000 / 30) return;
    const deltaTime = this.lastSceneFrame ? Math.min(0.08, (time - this.lastSceneFrame) / 1000) : 1 / 30;
    this.lastSceneFrame = time;
    this.environment?.update(this.frame(), deltaTime);
    this.renderedFrames++;
    if (time - this.fpsWindowStart >= 1000) {
      this.fps.set(Math.round(this.renderedFrames * 1000 / (time - this.fpsWindowStart)));
      this.renderedFrames = 0;
      this.fpsWindowStart = time;
    }
  };

  onAudioSessionModeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const mode = value === 'play-and-record' ? 'play-and-record' : 'auto';
    this.requestedAudioSessionMode.set(mode);
    this.sessionSetResult.set(mode === 'auto' ? 'not attempted (Auto)' : 'not attempted');
    this.sessionSetError.set('');
  }

  async startListening(): Promise<void> {
    if (this.destroyed || this.status() === 'requesting' || this.status() === 'listening') return;
    const token = ++this.startToken;
    this.error.set('');
    this.sessionSetResult.set(this.requestedAudioSessionMode() === 'auto' ? 'not attempted (Auto)' : 'not attempted');
    this.sessionSetError.set('');
    this.sessionRestoreResult.set('not attempted');
    this.sessionRestoreError.set('');
    this.sampleRate.set(null);
    this.trackState.set('not acquired');
    this.trackSettings.set('not acquired');
    this.contextState.set('not created');
    this.status.set('requesting');
    this.message.set('Waiting for microphone permission…');
    this.updateAudioSessionDiagnostic();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is unavailable. Open this page over HTTPS in Safari.');
      }
      if (this.requestedAudioSessionMode() === 'play-and-record') {
        this.setAudioSessionType('play-and-record', 'start');
      }
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
      this.trackState.set(track.readyState);
      this.trackSettings.set(JSON.stringify(track.getSettings(), null, 2));

      const context = new AudioContext();
      this.context = context;
      context.addEventListener('statechange', this.onContextStateChange);
      this.sampleRate.set(context.sampleRate);
      this.contextState.set(context.state);

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
      this.contextState.set(context.state);
      this.updateAudioSessionDiagnostic();
      this.resetAnalysis();
      this.status.set('listening');
      this.message.set('Listening to the room.');
      this.animationId = requestAnimationFrame(this.analyze);
    } catch (cause) {
      if (this.destroyed || token !== this.startToken) return;
      this.releaseAudio();
      this.status.set('error');
      this.error.set(cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
      this.message.set('Could not start microphone capture.');
    }
  }

  stopListening(): void {
    ++this.startToken;
    this.releaseAudio();
    this.status.set('stopped');
    this.message.set('The rain is still here. Start Vibe to listen again.');
    this.error.set('');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.sceneAnimationId !== null) cancelAnimationFrame(this.sceneAnimationId);
    this.sceneAnimationId = null;
    window.removeEventListener('resize', this.resizeEnvironment);
    window.visualViewport?.removeEventListener('resize', this.resizeEnvironment);
    this.environment?.stop();
    this.environment = null;
    ++this.startToken;
    this.releaseAudio();
  }

  private readonly onTrackEnded = (): void => {
    if (this.status() !== 'listening') return;
    this.releaseAudio();
    this.status.set('stopped');
    this.message.set('The microphone track ended. Tap Start Listening to try again.');
  };

  private readonly onContextStateChange = (): void => {
    this.contextState.set(this.context?.state ?? 'closed');
  };

  private readonly analyze = (time: number): void => {
    const analyser = this.analyser;
    const context = this.context;
    const frequencies = this.frequencyData;
    const samples = this.timeData;
    if (this.status() !== 'listening' || !analyser || !context || !frequencies || !samples) return;
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
    const transient = (rawBass > 0.14 || rawVolume > 0.1) && rise > 0.55;
    if (transient && time - this.lastBeatTime > 220) {
      this.lastBeatTime = time;
      this.beatUntil = time + 110;
      this.peakBeatStrength = clamp01((rise - 0.55) / 1.5 + 0.25);
    }
    this.baselineBass += (rawBass - this.baselineBass) * baselineAlpha;
    this.baselineVolume += (rawVolume - this.baselineVolume) * baselineAlpha;

    const previous = this.frame();
    const smooth = (oldValue: number, nextValue: number): number => {
      const alpha = 1 - Math.exp(-elapsed / (nextValue > oldValue ? 0.07 : 0.2));
      return oldValue + (nextValue - oldValue) * alpha;
    };
    const energyTarget = clamp01(rawVolume * 0.55 + rawBass * 0.2 + rawMid * 0.2 + rawHigh * 0.05);
    this.frame.set({
      volume: smooth(previous.volume, rawVolume),
      bass: smooth(previous.bass, rawBass),
      mid: smooth(previous.mid, rawMid),
      high: smooth(previous.high, rawHigh),
      energy: previous.energy + (energyTarget - previous.energy) * (1 - Math.exp(-elapsed / (energyTarget > previous.energy ? 0.45 : 1.15))),
      beat: time < this.beatUntil,
      beatStrength: this.peakBeatStrength * Math.max(0, 1 - (time - this.lastBeatTime) / 380),
    });

    if (time - this.lastDiagnosticTime > 500) {
      this.lastDiagnosticTime = time;
      this.contextState.set(context.state);
      this.trackState.set(this.stream?.getAudioTracks()[0]?.readyState ?? 'ended');
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
      // Map the analyser's -90 to -10 dB byte range to a useful visual range.
      const level = clamp01((data[bin] - 55) / 150);
      squares += level * level;
    }
    return clamp01(Math.sqrt(squares / (highBin - lowBin + 1)));
  }

  private updateAudioSessionDiagnostic(): void {
    try {
      const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
      this.audioSessionAvailable.set(Boolean(session));
      this.audioSessionType.set(session?.type ?? 'unavailable');
      this.sessionReadError.set('');
    } catch (cause) {
      this.audioSessionAvailable.set(false);
      this.audioSessionType.set('unavailable');
      this.sessionReadError.set(this.errorMessage(cause));
    }
  }

  private setAudioSessionType(type: AudioSessionMode, phase: 'start' | 'restore'): void {
    const result = phase === 'start' ? this.sessionSetResult : this.sessionRestoreResult;
    const error = phase === 'start' ? this.sessionSetError : this.sessionRestoreError;
    try {
      const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
      if (!session) {
        result.set('unavailable');
        return;
      }
      session.type = type;
      result.set(session.type === type ? 'succeeded' : 'failed (readback differs)');
      this.updateAudioSessionDiagnostic();
    } catch (cause) {
      result.set('failed');
      error.set(this.errorMessage(cause));
      this.updateAudioSessionDiagnostic();
    }
  }

  private errorMessage(cause: unknown): string {
    return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  }

  private resetAnalysis(): void {
    this.frame.set(EMPTY_AUDIO_FRAME);
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
    this.contextState.set(hadContext ? 'closed' : 'not created');
    this.trackState.set(hadStream ? 'ended' : 'not acquired');
    this.resetAnalysis();
    this.setAudioSessionType('auto', 'restore');
    this.updateAudioSessionDiagnostic();
  }
}
