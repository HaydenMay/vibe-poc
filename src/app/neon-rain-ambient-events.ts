export type NeonRainAmbientEventType =
  | 'sign-flicker'
  | 'window-shift'
  | 'haze-sweep'
  | 'light-bloom'
  | 'rain-glint';

export interface NeonRainAmbientEventFrame {
  type: NeonRainAmbientEventType | null;
  strength: number;
  target: number;
}

const EVENT_TYPES: readonly NeonRainAmbientEventType[] = [
  'sign-flicker',
  'window-shift',
  'haze-sweep',
  'light-bloom',
  'rain-glint',
];

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Schedules brief city details with long quiet gaps between events. */
export class NeonRainAmbientEvents {
  private readonly frame: NeonRainAmbientEventFrame = { type: null, strength: 0, target: 0 };
  private activeType: NeonRainAmbientEventType | null = null;
  private activeElapsed = 0;
  private activeDuration = 0;
  private activeTarget = 0;
  private cooldown = 0;

  constructor(private readonly random: () => number) {
    this.reset();
  }

  reset(): void {
    this.activeType = null;
    this.activeElapsed = 0;
    this.activeDuration = 0;
    this.activeTarget = 0;
    this.cooldown = 8 + clamp01(this.random()) * 7;
    this.frame.type = null;
    this.frame.strength = 0;
    this.frame.target = 0;
  }

  update(deltaTime: number): NeonRainAmbientEventFrame {
    const dt = Math.min(0.08, Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0));

    if (this.activeType === null) {
      this.cooldown -= dt;
      if (this.cooldown > 0) return this.clearFrame();
      this.startEvent();
    }

    const progress = clamp01(this.activeElapsed / this.activeDuration);
    this.frame.type = this.activeType;
    this.frame.target = this.activeTarget;
    this.frame.strength = Math.sin(Math.PI * progress);
    this.activeElapsed += dt;

    if (this.activeElapsed >= this.activeDuration) {
      this.activeType = null;
      this.cooldown = 12 + clamp01(this.random()) * 14;
      return this.clearFrame();
    }

    return this.frame;
  }

  private startEvent(): void {
    const randomIndex = Math.min(EVENT_TYPES.length - 1, Math.floor(clamp01(this.random()) * EVENT_TYPES.length));
    this.activeType = EVENT_TYPES[randomIndex];
    this.activeElapsed = 0;
    this.activeDuration = 1.6 + clamp01(this.random()) * 0.8;
    this.activeTarget = clamp01(this.random());
  }

  private clearFrame(): NeonRainAmbientEventFrame {
    this.frame.type = null;
    this.frame.strength = 0;
    this.frame.target = 0;
    return this.frame;
  }
}
