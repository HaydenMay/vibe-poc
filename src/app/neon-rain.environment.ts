import { AudioReactiveFrame } from './audio-reactive-frame';
import { VibeEnvironment } from './vibe-environment';

type Drop = { x: number; y: number; depth: number; length: number; speed: number };
type Mote = { x: number; y: number; size: number; phase: number };
type Building = { x: number; width: number; top: number; near: boolean };

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export class NeonRainEnvironment implements VibeEnvironment {
  private readonly context: CanvasRenderingContext2D;
  private readonly backdrop = document.createElement('canvas');
  private readonly drops: Drop[] = [];
  private readonly motes: Mote[] = [];
  private readonly buildings: Building[] = [];
  private width = 1;
  private height = 1;
  private horizon = 1;
  private pixelRatio = 1;
  private time = 0;
  private bassGlow = 0;
  private motion = 0;
  private energy = 0;
  private beatAccent = 0;
  private beatWasActive = false;
  private active = false;
  private seed = 98127;

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
    this.drops.length = 0;
    this.motes.length = 0;
    this.buildings.length = 0;
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
  }

  update(frame: AudioReactiveFrame, deltaTime: number): void {
    if (!this.active) return;
    const dt = Math.min(0.08, Math.max(0, deltaTime));
    this.time += dt;
    this.energy += (frame.energy - this.energy) * Math.min(1, dt * 1.7);
    this.bassGlow += (frame.bass - this.bassGlow) * Math.min(1, dt * 2.3);
    this.motion += (frame.mid - this.motion) * Math.min(1, dt * 1.2);
    if (frame.beat && !this.beatWasActive) {
      this.beatAccent = Math.max(this.beatAccent, 0.35 + frame.beatStrength * 0.65);
    }
    this.beatWasActive = frame.beat;
    this.beatAccent *= Math.exp(-dt * 7);

    const ctx = this.context;
    const w = this.width;
    const h = this.height;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.backdrop, 0, 0, w, h);
    this.drawDistantLights(frame);
    this.drawFog();
    this.drawNearArchitecture();
    this.drawNeonSigns();
    this.drawReflections();
    this.drawRain(frame, dt);
    this.drawMotes(frame);
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
      const depth = this.random();
      this.drops.push({
        x: this.random() * this.width,
        y: this.random() * this.height,
        depth,
        length: 5 + depth * 15,
        speed: 85 + depth * 270,
      });
    }
    for (let i = 0; i < 26; i++) {
      this.motes.push({
        x: this.random() * this.width,
        y: this.random() * this.horizon,
        size: 0.5 + this.random() * 1.4,
        phase: this.random() * Math.PI * 2,
      });
    }
  }

  private paintBackdrop(): void {
    const ctx = this.backdrop.getContext('2d');
    if (!ctx) return;
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
            ctx.fillStyle = this.random() > 0.76 ? 'rgba(239,140,183,0.26)' : 'rgba(130,183,205,0.21)';
            ctx.fillRect(wx, wy, 2, 3);
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

  private drawDistantLights(frame: AudioReactiveFrame): void {
    const ctx = this.context;
    const light = 0.28 + this.bassGlow * 0.33 + this.energy * 0.13 + this.beatAccent * 0.12;
    this.softLight(this.width * 0.19, this.height * 0.43, this.width * 0.36, `rgba(235,65,146,${light})`);
    this.softLight(this.width * 0.73, this.height * 0.48, this.width * 0.43, `rgba(46,189,224,${light * 0.86})`);
    this.softLight(this.width * 0.5, this.horizon - 10, this.width * 0.32, `rgba(139,109,238,${0.13 + this.bassGlow * 0.19})`);
    ctx.fillStyle = `rgba(111,169,201,${0.08 + frame.energy * 0.09})`;
    ctx.fillRect(0, this.horizon - 1, this.width, 2);
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

  private drawFog(): void {
    const ctx = this.context;
    const drift = this.time * (3 + this.motion * 15);
    for (let i = 0; i < 3; i++) {
      const x = this.width * (0.18 + i * 0.34) + Math.sin(drift * 0.22 + i * 2.1) * 38;
      const y = this.horizon - 28 + i * 10;
      const radius = this.width * (0.42 + i * 0.07);
      const fog = ctx.createRadialGradient(x, y, 4, x, y, radius);
      fog.addColorStop(0, `rgba(110,151,183,${0.08 + this.motion * 0.07})`);
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

  private drawNeonSigns(): void {
    const ctx = this.context;
    const flicker = 0.77 + Math.sin(this.time * 1.9) * 0.05 + this.beatAccent * 0.18;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowBlur = 13 + this.bassGlow * 18 + this.beatAccent * 13;
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255,98,168,${flicker})`;
    const lx = this.width * 0.11;
    const ly = this.height * 0.37;
    ctx.strokeRect(lx, ly, this.width * 0.12, this.height * 0.075);
    ctx.beginPath();
    ctx.moveTo(lx + 7, ly + 12);
    ctx.lineTo(lx + this.width * 0.12 - 7, ly + 12);
    ctx.moveTo(lx + 7, ly + 23);
    ctx.lineTo(lx + this.width * 0.12 - 12, ly + 23);
    ctx.stroke();
    ctx.shadowBlur = 11 + this.bassGlow * 15;
    ctx.strokeStyle = `rgba(73,220,237,${0.66 + this.beatAccent * 0.22})`;
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

  private drawReflections(): void {
    const ctx = this.context;
    const ground = this.horizon + 5;
    const intensity = 0.15 + this.bassGlow * 0.25 + this.beatAccent * 0.14;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let lane = 0; lane < 2; lane++) {
      const baseX = this.width * (lane === 0 ? 0.32 : 0.68);
      ctx.strokeStyle = lane === 0 ? `rgba(238,78,154,${intensity})` : `rgba(70,202,224,${intensity})`;
      for (let i = 0; i < 30; i++) {
        const depth = (i + 1) / 30;
        const y = ground + depth * depth * (this.height - ground);
        const width = (2 + depth * this.width * 0.16) * (0.55 + 0.45 * Math.sin(i * 4.2 + this.time * 1.5));
        const shimmer = Math.sin(this.time * 1.3 + i * 1.4) * (1 + depth * 4);
        ctx.lineWidth = 1 + depth * 2;
        ctx.beginPath();
        ctx.moveTo(baseX - width / 2 + shimmer, y);
        ctx.lineTo(baseX + width / 2 + shimmer, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawRain(frame: AudioReactiveFrame, dt: number): void {
    const ctx = this.context;
    const wind = 8 + this.motion * 26;
    const brightFraction = 0.1 + frame.high * 0.35 + this.energy * 0.12;
    for (let i = 0; i < this.drops.length; i++) {
      const drop = this.drops[i];
      drop.y += (drop.speed + this.energy * 145) * dt;
      drop.x += wind * (0.2 + drop.depth) * dt;
      if (drop.y > this.height + drop.length) {
        drop.y = -drop.length;
        drop.x = this.random() * this.width;
      }
      if (drop.x > this.width + 4) drop.x = -4;
      const highlighted = (i % 17) / 17 < brightFraction;
      ctx.strokeStyle = highlighted
        ? `rgba(170,228,247,${0.22 + frame.high * 0.22})`
        : `rgba(148,178,209,${0.07 + drop.depth * 0.13})`;
      ctx.lineWidth = drop.depth > 0.75 ? 1.1 : 0.65;
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + 2 + drop.depth * 2, drop.y + drop.length);
      ctx.stroke();
    }
  }

  private drawMotes(frame: AudioReactiveFrame): void {
    const ctx = this.context;
    for (const mote of this.motes) {
      const twinkle = Math.max(0, Math.sin(this.time * (0.7 + frame.high * 1.5) + mote.phase));
      const alpha = 0.09 + twinkle * (0.12 + frame.high * 0.28);
      ctx.fillStyle = `rgba(193,228,242,${clamp01(alpha)})`;
      ctx.beginPath();
      ctx.arc(mote.x + Math.sin(this.time * 0.2 + mote.phase) * 5, mote.y, mote.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
