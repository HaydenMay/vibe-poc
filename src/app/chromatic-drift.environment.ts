import { AudioReactiveFrame } from './audio-reactive-frame';
import { ChromaticDriftAudioResponse, ChromaticDriftResponseFrame } from './chromatic-drift-audio-response';
import { VibeEnvironment } from './vibe-environment';

interface Ribbon {
  centerX: number;
  centerY: number;
  angle: number;
  span: number;
  thickness: number;
  hueOffset: number;
  phase: number;
  revealPhase: number;
  waveCount: number;
  driftRate: number;
  gradient: CanvasGradient;
}

const RIBBON_COUNT = 6;
const CURVE_SAMPLES = 20;
const TWO_PI = Math.PI * 2;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** A sparse, black-at-silence field of slowly shifting rainbow ribbons. */
export class ChromaticDriftEnvironment implements VibeEnvironment {
  readonly ribbons: Ribbon[] = [];

  private readonly context: CanvasRenderingContext2D;
  private readonly response = new ChromaticDriftAudioResponse();
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private time = 0;
  private driftPhase = 0;
  private flowPhase = 0;
  private active = false;
  private seed = 81337;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
  }

  start(): void {
    this.active = true;
  }

  stop(): void {
    this.active = false;
    this.ribbons.length = 0;
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  resize(width: number, height: number): void {
    if (width < 1 || height < 1) return;
    this.width = width;
    this.height = height;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.time = 0;
    this.driftPhase = 0;
    this.flowPhase = 0;
    this.seed = 81337;
    this.createRibbons();
  }

  update(frame: AudioReactiveFrame, deltaTime: number): void {
    if (!this.active) return;
    const dt = Math.min(0.08, Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0));
    this.time += dt;

    const response = this.response.update(frame, dt);
    this.driftPhase += dt * (1 + response.energyDrift * 2.3);
    this.flowPhase += dt * (0.35 + response.energyDrift * 1.65);
    const ctx = this.context;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.width, this.height);

    if (response.ribbonVisibility > 0) {
      for (const ribbon of this.ribbons) this.drawRibbon(ribbon, response);
    }
    this.drawBeatRipple(response);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private createRibbons(): void {
    this.ribbons.length = 0;
    for (let index = 0; index < RIBBON_COUNT; index++) {
      const centerX = (this.random() * 1.3 - 0.15) * this.width;
      const centerY = (0.08 + this.random() * 0.84) * this.height;
      const angle = (this.random() * 2 - 1) * 0.68;
      const span = this.width * (0.82 + this.random() * 0.78);
      const hueOffset = this.random() * 360;
      const gradient = this.context.createLinearGradient(
        centerX - Math.cos(angle) * span * 0.5,
        centerY - Math.sin(angle) * span * 0.5,
        centerX + Math.cos(angle) * span * 0.5,
        centerY + Math.sin(angle) * span * 0.5,
      );
      for (let stop = 0; stop <= 6; stop++) {
        const hue = (hueOffset + stop * 60) % 360;
        gradient.addColorStop(stop / 6, `hsl(${hue} 100% 62%)`);
      }
      this.ribbons.push({
        centerX,
        centerY,
        angle,
        span,
        thickness: this.height * (0.026 + this.random() * 0.034),
        hueOffset,
        phase: this.random() * TWO_PI,
        revealPhase: this.random() * TWO_PI,
        waveCount: 0.7 + this.random() * 1.8,
        driftRate: 0.08 + this.random() * 0.14,
        gradient,
      });
    }
  }

  private drawRibbon(ribbon: Ribbon, response: ChromaticDriftResponseFrame): void {
    const ctx = this.context;
    const drift = Math.sin(this.driftPhase * ribbon.driftRate + ribbon.phase);
    const centerX = ribbon.centerX + drift * this.width * (0.012 + response.energyDrift * 0.035);
    const centerY = ribbon.centerY + Math.cos(this.time * ribbon.driftRate + ribbon.phase) *
      this.height * (0.008 + response.energyDrift * 0.018);
    const reveal = 0.34 + 0.66 * (0.5 + 0.5 * Math.sin(this.time * 0.115 + ribbon.revealPhase));
    const alpha = clamp01((response.ribbonVisibility * 0.56 + response.volumeGlow * 0.18 + response.beatPulse * 0.08) * reveal);
    if (alpha < 0.004) return;

    const broadWidth = ribbon.thickness * (1 + response.bassWidth * 0.52);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = ribbon.gradient;
    ctx.lineCap = 'round';

    ctx.globalAlpha = alpha * 0.12;
    ctx.lineWidth = broadWidth * 3.2;
    this.traceRibbon(ribbon, response, centerX, centerY);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.34;
    ctx.lineWidth = broadWidth * 1.75;
    this.traceRibbon(ribbon, response, centerX, centerY);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.72;
    ctx.lineWidth = broadWidth;
    this.traceRibbon(ribbon, response, centerX, centerY);
    ctx.stroke();

    if (response.highGlint > 0.01) {
      ctx.globalAlpha = alpha * response.highGlint * 0.46;
      ctx.lineWidth = 0.8 + response.highGlint * 1.1;
      this.traceRibbon(ribbon, response, centerX, centerY);
      ctx.stroke();
    }
    ctx.restore();
  }

  private traceRibbon(
    ribbon: Ribbon,
    response: ChromaticDriftResponseFrame,
    centerX: number,
    centerY: number,
  ): void {
    const ctx = this.context;
    const axisX = Math.cos(ribbon.angle);
    const axisY = Math.sin(ribbon.angle);
    const normalX = -axisY;
    const normalY = axisX;
    const waveAmplitude = this.height * (0.004 + response.bassWidth * 0.018 + response.midRipple * 0.052);
    const flow = this.flowPhase;
    const startX = centerX - axisX * ribbon.span * 0.5;
    const startY = centerY - axisY * ribbon.span * 0.5;

    ctx.beginPath();
    for (let index = 0; index <= CURVE_SAMPLES; index++) {
      const progress = index / CURVE_SAMPLES;
      const wave = Math.sin(progress * ribbon.waveCount * TWO_PI + flow + ribbon.phase) * waveAmplitude;
      const x = startX + axisX * ribbon.span * progress + normalX * wave;
      const y = startY + axisY * ribbon.span * progress + normalY * wave;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  private drawBeatRipple(response: ChromaticDriftResponseFrame): void {
    const strength = response.beatPulse;
    if (strength <= 0.01 || response.beatProgress >= 1) return;

    const progress = response.beatProgress;
    const x = this.width * (0.3 + progress * 0.4);
    const y = this.height * (0.48 + Math.sin(progress * Math.PI) * 0.08);
    const radiusX = this.width * (0.016 + progress * 0.105);
    const radiusY = this.height * (0.018 + progress * 0.075);
    const alpha = clamp01(strength * (0.34 + (1 - progress) * 0.4));
    const hue = (this.time * 72 + 190) % 360;
    const ctx = this.context;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `hsla(${hue} 100% 75% / ${alpha})`;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.2 + strength * 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, -0.14, 0, TWO_PI);
    ctx.stroke();

    ctx.strokeStyle = `hsla(${(hue + 85) % 360} 100% 72% / ${alpha * 0.52})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX * 1.22, radiusY * 1.24, -0.14, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
}
