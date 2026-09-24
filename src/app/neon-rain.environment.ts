import { AudioReactiveFrame } from './audio-reactive-frame';
import { NeonRainAmbientEventFrame, NeonRainAmbientEvents } from './neon-rain-ambient-events';
import { NeonRainAudioResponse, NeonRainAudioResponseFrame } from './neon-rain-audio-response';
import { VibeEnvironment } from './vibe-environment';

type Drop = { x: number; y: number; depth: number; length: number; speed: number; phase: number; layer: number };
type Mote = { x: number; y: number; size: number; phase: number; depth: number; drift: number; rise: number };
type Building = { x: number; width: number; top: number; near: boolean };
type WindowLight = { x: number; y: number; phase: number; pink: boolean; baseAlpha: number };

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const FOG_LAYER_SPEEDS = [0.62, 0.91, 1.22] as const;

export class NeonRainEnvironment implements VibeEnvironment {
  private readonly context: CanvasRenderingContext2D;
  private readonly backdrop = document.createElement('canvas');
  private readonly drops: Drop[] = [];
  private readonly motes: Mote[] = [];
  private readonly buildings: Building[] = [];
  private readonly windowLights: WindowLight[] = [];
  private readonly audioResponse = new NeonRainAudioResponse();
  private readonly ambientEvents: NeonRainAmbientEvents;
  private width = 1;
  private height = 1;
  private horizon = 1;
  private pixelRatio = 1;
  private time = 0;
  private active = false;
  private seed = 98127;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
    this.ambientEvents = new NeonRainAmbientEvents(() => this.random());
  }

  start(): void {
    this.active = true;
  }

  stop(): void {
    this.active = false;
    this.drops.length = 0;
    this.motes.length = 0;
    this.buildings.length = 0;
    this.windowLights.length = 0;
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.backdrop.width = 0;
    this.backdrop.height = 0;
  }

  resize(width: number, height: number): void {
    if (width < 1 || height < 1) return;
    this.width = width;
    this.height = height;
    this.horizon = height * 0.61;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.backdrop.width = this.canvas.width;
    this.backdrop.height = this.canvas.height;
    this.seed = 98127;
    this.createBuildings();
    this.createWeather();
    this.paintBackdrop();
    this.ambientEvents.reset();
  }

  update(frame: AudioReactiveFrame, deltaTime: number): void {
    if (!this.active) return;
    const dt = Math.min(0.08, Math.max(0, deltaTime));
    this.time += dt;
    const response = this.audioResponse.update(frame, dt);
    const ambientEvent = this.ambientEvents.update(dt);

    const ctx = this.context;
    const w = this.width;
    const h = this.height;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.backdrop, 0, 0, w, h);
    this.drawDistantLights(response, ambientEvent);
    this.drawWindowLights(response, ambientEvent);
    this.drawFog(response, ambientEvent);
    this.drawNearArchitecture();
    this.drawNeonSigns(response, ambientEvent);
    this.drawReflections(response);
    this.drawBeatRipple(response);
    this.drawRain(response, ambientEvent, dt);
    this.drawMotes(response, dt);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private createBuildings(): void {
    this.buildings.length = 0;
    let x = -8;
    while (x < this.width + 8) {
      const buildingWidth = 16 + this.random() * 35;
      const top = this.horizon - 35 - this.random() * (this.height * 0.19);
      this.buildings.push({ x, width: buildingWidth, top, near: false });
      x += buildingWidth - 2;
    }
    this.buildings.push({ x: -6, width: this.width * 0.16, top: this.height * 0.18, near: true });
    this.buildings.push({ x: this.width * 0.88, width: this.width * 0.16, top: this.height * 0.1, near: true });
  }

  private createWeather(): void {
    this.drops.length = 0;
    this.motes.length = 0;
    const dropCount = Math.min(165, Math.max(75, Math.round(this.width * this.height / 3600)));
    for (let i = 0; i < dropCount; i++) {
      const layer = i % 3;
      const depth = (layer + 0.15 + this.random() * 0.7) / 3;
      this.drops.push({
        x: this.random() * this.width,
        y: this.random() * this.height,
        depth,
        length: 3 + depth * 18,
        speed: 55 + depth * 210 + layer * 14,
        phase: this.random() * Math.PI * 2,
        layer,
      });
    }
    for (let i = 0; i < 26; i++) {
      const depth = this.random();
      this.motes.push({
        x: this.random() * this.width,
        y: this.random() * this.height * 0.86,
        size: 0.45 + depth * 1.45,
        phase: this.random() * Math.PI * 2,
        depth,
        drift: (this.random() * 2 - 1) * (2 + depth * 7),
        rise: 2 + depth * 7,
      });
    }
  }

  private paintBackdrop(): void {
    const ctx = this.backdrop.getContext('2d');
    if (!ctx) return;
    this.windowLights.length = 0;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    const w = this.width;
    const h = this.height;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#030711');
    sky.addColorStop(0.36, '#0a1427');
    sky.addColorStop(0.61, '#18233a');
    sky.addColorStop(0.64, '#0b1524');
    sky.addColorStop(1, '#03070e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const ambient = ctx.createRadialGradient(w * 0.53, h * 0.46, 2, w * 0.53, h * 0.46, w * 0.6);
    ambient.addColorStop(0, 'rgba(76,96,145,0.25)');
    ambient.addColorStop(1, 'rgba(8,11,24,0)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, w, this.horizon + 20);

    for (const building of this.buildings) {
      if (building.near) continue;
      ctx.fillStyle = '#0a111e';
      ctx.fillRect(building.x, building.top, building.width, this.horizon - building.top + 10);
      ctx.fillStyle = 'rgba(86,119,161,0.18)';
      ctx.fillRect(building.x + 2, building.top + 3, 1, this.horizon - building.top);
      for (let wx = building.x + 5; wx < building.x + building.width - 2; wx += 8) {
        for (let wy = building.top + 9; wy < this.horizon - 5; wy += 11) {
          if (this.random() > 0.72) {
            const pink = this.random() > 0.76;
            const baseAlpha = pink ? 0.26 : 0.21;
            ctx.fillStyle = pink ? 'rgba(239,140,183,0.26)' : 'rgba(130,183,205,0.21)';
            ctx.fillRect(wx, wy, 2, 3);
            if (this.random() > 0.87) {
              this.windowLights.push({
                x: wx,
                y: wy,
                pink,
                baseAlpha,
                phase: this.random() * Math.PI * 2,
              });
            }
          }
        }
      }
    }

    // A wet road converges toward the center of the distant skyline.
    ctx.fillStyle = '#060d18';
    ctx.beginPath();
    ctx.moveTo(w * 0.47, this.horizon);
    ctx.lineTo(w * 0.53, this.horizon);
    ctx.lineTo(w * 1.14, h);
    ctx.lineTo(-w * 0.14, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(121,155,189,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.47, this.horizon);
    ctx.lineTo(w * 0.11, h);
    ctx.moveTo(w * 0.53, this.horizon);
    ctx.lineTo(w * 0.89, h);
    ctx.stroke();
  }

  private drawDistantLights(
    response: NeonRainAudioResponseFrame,
    event: NeonRainAmbientEventFrame,
  ): void {
    const ctx = this.context;
    const ambientCycle = 0.5 + 0.5 * Math.sin(this.time * 0.18);
    const light = 0.23 + ambientCycle * 0.035 + response.cityLight * 0.24 + response.beatPulse * 0.07;
    const bloomTarget = Math.min(2, Math.floor(event.target * 3));
    const bloom = event.type === 'light-bloom' ? event.strength * 0.14 : 0;
    this.softLight(
      this.width * 0.19,
      this.height * 0.43,
      this.width * 0.36,
      `rgba(235,65,146,${light + (bloomTarget === 0 ? bloom : 0)})`,
    );
    this.softLight(
      this.width * 0.73,
      this.height * 0.48,
      this.width * 0.43,
      `rgba(46,189,224,${light * 0.86 + (bloomTarget === 1 ? bloom : 0)})`,
    );
    this.softLight(
      this.width * 0.5,
      this.horizon - 10,
      this.width * 0.32,
      `rgba(139,109,238,${0.12 + response.cityLight * 0.13 + (bloomTarget === 2 ? bloom : 0)})`,
    );
    ctx.fillStyle = `rgba(111,169,201,${0.08 + response.cityLight * 0.07 + response.beatPulse * 0.035})`;
    ctx.fillRect(0, this.horizon - 1, this.width, 2);
  }

  private drawWindowLights(
    response: NeonRainAudioResponseFrame,
    event: NeonRainAmbientEventFrame,
  ): void {
    const ctx = this.context;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const eventGroup = Math.min(3, Math.floor(event.target * 4));
    for (const windowLight of this.windowLights) {
      const midVariation =
        (0.5 + 0.5 * Math.sin(this.time * 1.4 + windowLight.phase)) * response.midMotion * 0.16;
      const windowGroup = Math.min(3, Math.floor((windowLight.x / this.width) * 4));
      const eventVariation = event.type === 'window-shift' && windowGroup === eventGroup
        ? event.strength * 0.16
        : 0;
      const alpha = clamp01(windowLight.baseAlpha + response.cityLight * 0.2 + midVariation + eventVariation);
      ctx.fillStyle = windowLight.pink
        ? `rgba(239,140,183,${alpha})`
        : `rgba(130,183,205,${alpha})`;
      ctx.fillRect(windowLight.x, windowLight.y, 2, 3);
    }
    ctx.restore();
  }

  private softLight(x: number, y: number, radius: number, color: string): void {
    const ctx = this.context;
    const glow = ctx.createRadialGradient(x, y, 1, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawFog(
    response: NeonRainAudioResponseFrame,
    event: NeonRainAmbientEventFrame,
  ): void {
    const ctx = this.context;
    for (let i = 0; i < 3; i++) {
      const driftSpeed = (2.2 + response.midMotion * 18 + response.energyMotion * 6) * FOG_LAYER_SPEEDS[i];
      const drift = this.time * driftSpeed;
      const sweepLayer = Math.min(2, Math.floor(event.target * 3));
      const sweep = event.type === 'haze-sweep' && sweepLayer === i
        ? (event.target < 0.5 ? -1 : 1) * event.strength * this.width * 0.05
        : 0;
      const x = this.width * (0.18 + i * 0.34) + Math.sin(drift * 0.22 + i * 2.1) * (27 + i * 9) + sweep;
      const verticalDrift = Math.sin(this.time * (0.12 + i * 0.025) + i * 1.9) * (2 + i * 1.5);
      const y = this.horizon - 28 + i * 10 + verticalDrift;
      const radius = this.width * (0.38 + i * 0.07);
      const fog = ctx.createRadialGradient(x, y, 4, x, y, radius);
      fog.addColorStop(0, `rgba(110,151,183,${0.08 + response.midMotion * 0.035 + response.energyMotion * 0.02})`);
      fog.addColorStop(1, 'rgba(27,43,65,0)');
      ctx.fillStyle = fog;
      ctx.fillRect(x - radius, y - radius * 0.43, radius * 2, radius * 0.86);
    }
  }

  private drawNearArchitecture(): void {
    const ctx = this.context;
    for (const building of this.buildings) {
      if (!building.near) continue;
      const shade = ctx.createLinearGradient(building.x, 0, building.x + building.width, 0);
      shade.addColorStop(0, '#02050c');
      shade.addColorStop(1, '#0b1729');
      ctx.fillStyle = shade;
      ctx.fillRect(building.x, building.top, building.width, this.height - building.top);
      ctx.fillStyle = 'rgba(79,112,146,0.22)';
      ctx.fillRect(building.x + building.width - 3, building.top, 2, this.height - building.top);
      ctx.fillStyle = 'rgba(108,148,179,0.12)';
      for (let y = building.top + 22; y < this.horizon; y += 36) {
        ctx.fillRect(building.x + 8, y, Math.max(4, building.width - 20), 1);
      }
    }
  }

  private drawNeonSigns(
    response: NeonRainAudioResponseFrame,
    event: NeonRainAmbientEventFrame,
  ): void {
    const ctx = this.context;
    const leftEvent = event.type === 'sign-flicker' && event.target < 0.5 ? event.strength : 0;
    const rightEvent = event.type === 'sign-flicker' && event.target >= 0.5 ? event.strength : 0;
    const shimmer = Math.sin(this.time * 0.64) * 0.035;
    const leftFlicker = clamp01(
      0.73 + shimmer + response.cityLight * 0.14 + response.beatPulse * 0.16 + leftEvent * 0.12,
    );
    const rightFlicker = clamp01(
      0.66 + shimmer + response.cityLight * 0.14 + response.beatPulse * 0.12 + rightEvent * 0.12,
    );
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowBlur = 13 + response.cityLight * 14 + response.beatPulse * 13 + leftEvent * 6;
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255,98,168,${leftFlicker})`;
    const lx = this.width * 0.11;
    const ly = this.height * 0.37;
    ctx.strokeRect(lx, ly, this.width * 0.12, this.height * 0.075);
    ctx.beginPath();
    ctx.moveTo(lx + 7, ly + 12);
    ctx.lineTo(lx + this.width * 0.12 - 7, ly + 12);
    ctx.moveTo(lx + 7, ly + 23);
    ctx.lineTo(lx + this.width * 0.12 - 12, ly + 23);
    ctx.stroke();
    ctx.shadowBlur = 11 + response.cityLight * 12 + response.beatPulse * 8 + rightEvent * 6;
    ctx.strokeStyle = `rgba(73,220,237,${rightFlicker})`;
    const rx = this.width * 0.74;
    const ry = this.height * 0.31;
    ctx.strokeRect(rx, ry, this.width * 0.15, this.height * 0.055);
    ctx.beginPath();
    ctx.moveTo(rx + 8, ry + 9);
    ctx.lineTo(rx + 8, ry + this.height * 0.055 - 9);
    ctx.moveTo(rx + 17, ry + 9);
    ctx.lineTo(rx + 17, ry + this.height * 0.055 - 9);
    ctx.stroke();
    ctx.restore();
  }

  private drawReflections(response: NeonRainAudioResponseFrame): void {
    const ctx = this.context;
    const ground = this.horizon + 5;
    const bass = response.bassReflection;
    const intensity = 0.11 + bass * 0.33 + response.beatPulse * 0.15;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let lane = 0; lane < 2; lane++) {
      const baseX = this.width * (lane === 0 ? 0.32 : 0.68);
      ctx.strokeStyle = lane === 0 ? `rgba(238,78,154,${intensity})` : `rgba(70,202,224,${intensity})`;
      for (let i = 0; i < 30; i++) {
        const depth = (i + 1) / 30;
        const y = ground + depth * depth * (this.height - ground);
        const width =
          (2 + depth * this.width * 0.16) *
          (0.55 + 0.45 * Math.sin(i * 4.2 + this.time * 0.55)) *
          (1 + bass * 0.62);
        const shimmer = Math.sin(this.time * 0.28 + i * 1.4) * (1 + depth * (4 + bass * 5));
        ctx.globalAlpha = 0.38 + depth * 0.62;
        ctx.lineWidth = 1 + depth * (2 + bass * 1.1);
        ctx.beginPath();
        ctx.moveTo(baseX - width / 2 + shimmer, y);
        ctx.lineTo(baseX + width / 2 + shimmer, y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawBeatRipple(response: NeonRainAudioResponseFrame): void {
    const strength = response.beatPulse;
    if (strength <= 0.01 || response.beatProgress >= 1) return;

    const ctx = this.context;
    const progress = response.beatProgress;
    const y = this.horizon + 8 + Math.pow(progress, 1.25) * (this.height - this.horizon - 8);
    const roadWidth = this.width * (0.06 + progress * 1.1);
    const radiusX = roadWidth * (0.12 + progress * 0.11);
    const radiusY = 2 + progress * 7;
    const alpha = clamp01(strength * (0.28 + (1 - progress) * 0.72) * 0.62);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(145,229,241,${alpha})`;
    ctx.lineWidth = 1.4 + strength * 1.4;
    ctx.beginPath();
    ctx.ellipse(this.width * 0.5, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(238,112,177,${alpha * 0.42})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(this.width * 0.5, y, radiusX * 1.22, radiusY * 1.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawRain(
    response: NeonRainAudioResponseFrame,
    event: NeonRainAmbientEventFrame,
    dt: number,
  ): void {
    const ctx = this.context;
    const wind = 6 + response.energyMotion * 42;
    const brightFraction = 0.035 + response.highDetail * 0.45;
    const eventDrop = Math.min(this.drops.length - 1, Math.floor(event.target * this.drops.length));
    for (let i = 0; i < this.drops.length; i++) {
      const drop = this.drops[i];
      drop.y += (drop.speed + response.energyMotion * 190) * dt;
      drop.x += (wind * (0.12 + drop.depth) + (drop.layer - 1) * 2.4) * dt;
      const streakLength = drop.length * (0.92 + response.energyMotion * 0.18);
      if (drop.y > this.height + streakLength) {
        drop.y = -streakLength;
        drop.x = this.random() * this.width;
      }
      if (drop.x > this.width + 4) drop.x = -4;
      if (drop.x < -4) drop.x = this.width + 4;
      const twinkle = 0.5 + 0.5 * Math.sin(this.time * (2.1 + response.highDetail * 2.2) + drop.phase);
      const eventGlint = event.type === 'rain-glint' && i === eventDrop ? event.strength : 0;
      const highlighted = ((i % 19) / 19 < brightFraction && twinkle > 0.72) || eventGlint > 0.12;
      ctx.strokeStyle = highlighted
        ? `rgba(170,228,247,${clamp01(0.18 + response.highDetail * 0.28 + eventGlint * 0.34)})`
        : `rgba(148,178,209,${0.045 + drop.depth * 0.14})`;
      ctx.lineWidth = 0.4 + drop.depth * 0.8 + response.highDetail * 0.14;
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + 1 + drop.depth * 3, drop.y + streakLength);
      ctx.stroke();
    }
  }

  private drawMotes(response: NeonRainAudioResponseFrame, dt: number): void {
    const ctx = this.context;
    for (const mote of this.motes) {
      mote.x += (mote.drift + response.energyMotion * 10) * dt;
      mote.y -= (mote.rise + response.energyMotion * 8) * dt;
      if (mote.x > this.width + 6) mote.x = -6;
      else if (mote.x < -6) mote.x = this.width + 6;
      if (mote.y < -4) mote.y = this.height * 0.86;

      const twinkle = Math.max(0, Math.sin(this.time * (0.42 + response.highDetail * 0.95) + mote.phase));
      const alpha = clamp01(0.035 + mote.depth * 0.025 + twinkle * (0.08 + response.highDetail * 0.22));
      ctx.fillStyle = `rgba(193,228,242,${clamp01(alpha)})`;
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.size * (1 + response.highDetail * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
