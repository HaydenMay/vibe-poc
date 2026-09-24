import { ChromaticDriftEnvironment } from './chromatic-drift.environment';
import { NeonRainEnvironment } from './neon-rain.environment';
import { VibeEnvironment } from './vibe-environment';

export const VIBE_SCENES = [
  {
    id: 'neon-rain',
    label: 'Neon Rain',
    edition: '001',
    description: 'A city at night, breathing with the sound around you.',
  },
  {
    id: 'chromatic-drift',
    label: 'Chromatic Drift',
    edition: '002',
    description: 'Rainbow color flows and ripples through the darkness.',
  },
] as const;

export type VibeSceneId = (typeof VIBE_SCENES)[number]['id'];

const assertNever = (sceneId: never): never => {
  throw new Error(`Unknown Vibe scene: ${sceneId}`);
};

export const createVibeEnvironment = (
  sceneId: VibeSceneId,
  canvas: HTMLCanvasElement,
): VibeEnvironment => {
  switch (sceneId) {
    case 'neon-rain':
      return new NeonRainEnvironment(canvas);
    case 'chromatic-drift':
      return new ChromaticDriftEnvironment(canvas);
    default:
      return assertNever(sceneId);
  }
};
