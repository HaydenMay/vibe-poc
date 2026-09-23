import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, signal } from '@angular/core';
import { AUDIO_PROVIDER_MODE } from './audio-provider-mode';
import { AudioReactiveFrame, EMPTY_AUDIO_FRAME } from './audio-reactive-frame';
import {
  AudioSessionMode,
  MicrophoneAudioProvider,
  MicrophoneDiagnostics,
  MicrophoneStatus,
} from './microphone-audio.provider';
import { LivelyAudioDiagnostics, LivelyAudioProvider } from './lively-audio.provider';
import { NeonRainEnvironment } from './neon-rain.environment';
import { VibeEnvironment } from './vibe-environment';

const IS_LIVELY_BUILD = AUDIO_PROVIDER_MODE === 'lively';

const EMPTY_MICROPHONE_DIAGNOSTICS: MicrophoneDiagnostics = {
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

const EMPTY_LIVELY_DIAGNOSTICS: LivelyAudioDiagnostics = {
  rawPeak: 0,
  rawAverage: 0,
  callbacks: 0,
  paused: false,
};

type CaptureStatus = MicrophoneStatus;

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('sceneCanvas', { static: true }) private sceneCanvas!: ElementRef<HTMLCanvasElement>;

  readonly isLivelyBuild = IS_LIVELY_BUILD;
  readonly providerName = IS_LIVELY_BUILD ? 'Lively' : 'Microphone';
  readonly frame = signal<AudioReactiveFrame>({ ...EMPTY_AUDIO_FRAME });
  readonly debugVisible = signal(false);
  readonly fps = signal(0);
  readonly status = signal<CaptureStatus>(IS_LIVELY_BUILD ? 'listening' : 'idle');
  readonly message = signal(IS_LIVELY_BUILD ? 'System audio is supplied by Lively.' : 'An atmosphere shaped by the sound around you.');
  readonly error = signal('');
  readonly microphoneDiagnostics = signal<MicrophoneDiagnostics>({ ...EMPTY_MICROPHONE_DIAGNOSTICS });
  readonly livelyDiagnostics = signal<LivelyAudioDiagnostics>({ ...EMPTY_LIVELY_DIAGNOSTICS });
  readonly requestedAudioSessionMode = signal<AudioSessionMode>('auto');

  private readonly livelyAudio = new LivelyAudioProvider();
  private microphoneAudio: MicrophoneAudioProvider | null = null;
  private destroyed = false;
  private environment: VibeEnvironment | null = null;
  private sceneAnimationId: number | null = null;
  private scenePaused = false;
  private lastSceneFrame = 0;
  private lastUiFrame = 0;
  private fpsWindowStart = 0;
  private renderedFrames = 0;

  constructor(private readonly zone: NgZone) {
    if (!IS_LIVELY_BUILD) {
      this.microphoneAudio = new MicrophoneAudioProvider((status, message) => {
        this.zone.run(() => {
          this.status.set(status);
          this.message.set(message);
          this.error.set(this.microphoneAudio?.error ?? '');
          this.syncDiagnostics();
        });
      });
      this.syncDiagnostics();
    }
  }

  ngAfterViewInit(): void {
    try {
      this.zone.runOutsideAngular(() => {
        this.environment = new NeonRainEnvironment(this.sceneCanvas.nativeElement);
        this.environment.start();
        this.resizeEnvironment();
        window.addEventListener('resize', this.resizeEnvironment);
        window.visualViewport?.addEventListener('resize', this.resizeEnvironment);
        if (IS_LIVELY_BUILD) this.livelyAudio.start(this.onWallpaperPause);
        this.sceneAnimationId = requestAnimationFrame(this.renderScene);
      });
    } catch (cause) {
      this.zone.run(() => this.error.set(`Visual environment: ${this.errorMessage(cause)}`));
    }
  }

  toggleDebug(): void {
    this.debugVisible.update((visible) => !visible);
  }

  onAudioSessionModeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const mode: AudioSessionMode = value === 'play-and-record' ? 'play-and-record' : 'auto';
    this.requestedAudioSessionMode.set(mode);
    this.microphoneAudio?.setRequestedAudioSessionMode(mode);
    this.syncDiagnostics();
  }

  async startListening(): Promise<void> {
    const microphoneAudio = this.microphoneAudio;
    if (IS_LIVELY_BUILD || !microphoneAudio || this.destroyed || microphoneAudio.status === 'requesting' || microphoneAudio.status === 'listening') return;
    this.error.set('');
    await this.zone.runOutsideAngular(() => microphoneAudio.start());
    this.zone.run(() => {
      this.error.set(microphoneAudio.error);
      this.status.set(microphoneAudio.status);
      this.syncDiagnostics();
    });
  }

  stopListening(): void {
    if (IS_LIVELY_BUILD) return;
    this.microphoneAudio?.stop();
    this.zone.run(() => {
      this.status.set(this.microphoneAudio?.status ?? 'stopped');
      this.message.set('The rain is still here. Start Vibe to listen again.');
      this.error.set('');
      this.syncDiagnostics();
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.sceneAnimationId !== null) cancelAnimationFrame(this.sceneAnimationId);
    this.sceneAnimationId = null;
    window.removeEventListener('resize', this.resizeEnvironment);
    window.visualViewport?.removeEventListener('resize', this.resizeEnvironment);
    this.livelyAudio.stop();
    this.environment?.stop();
    this.environment = null;
    this.microphoneAudio?.destroy();
    this.microphoneAudio = null;
  }

  private readonly resizeEnvironment = (): void => {
    this.environment?.resize(window.innerWidth, window.innerHeight);
  };

  private readonly renderScene = (time: number): void => {
    if (this.destroyed || this.scenePaused) return;
    this.sceneAnimationId = requestAnimationFrame(this.renderScene);
    if (this.lastSceneFrame && time - this.lastSceneFrame < 1000 / 30) return;
    const deltaTime = this.lastSceneFrame ? Math.min(0.08, (time - this.lastSceneFrame) / 1000) : 1 / 30;
    this.lastSceneFrame = time;

    const currentFrame = IS_LIVELY_BUILD
      ? this.livelyAudio.update(time)
      : (this.microphoneAudio?.frame ?? EMPTY_AUDIO_FRAME);
    this.environment?.update(currentFrame, deltaTime);

    this.renderedFrames++;
    if (time - this.lastUiFrame >= 100) {
      this.lastUiFrame = time;
      this.zone.run(() => {
        this.frame.set({ ...currentFrame });
        if (IS_LIVELY_BUILD) this.livelyDiagnostics.set(this.livelyAudio.diagnostics);
        else this.syncDiagnostics();
      });
    }
    if (time - this.fpsWindowStart >= 1000) {
      const fps = Math.round(this.renderedFrames * 1000 / (time - this.fpsWindowStart));
      this.renderedFrames = 0;
      this.fpsWindowStart = time;
      this.zone.run(() => this.fps.set(fps));
    }
  };

  private readonly onWallpaperPause = (paused: boolean): void => {
    this.scenePaused = paused;
    if (paused) {
      if (this.sceneAnimationId !== null) cancelAnimationFrame(this.sceneAnimationId);
      this.sceneAnimationId = null;
      this.lastSceneFrame = 0;
      return;
    }
    if (!this.destroyed && this.sceneAnimationId === null) {
      this.lastSceneFrame = 0;
      this.sceneAnimationId = requestAnimationFrame(this.renderScene);
    }
  };

  private syncDiagnostics(): void {
    if (this.microphoneAudio) this.microphoneDiagnostics.set(this.microphoneAudio.diagnostics);
  }

  private errorMessage(cause: unknown): string {
    return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  }
}
