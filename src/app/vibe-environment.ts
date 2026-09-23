import { AudioReactiveFrame } from './audio-reactive-frame';

export interface VibeEnvironment {
  start(): void;
  update(frame: AudioReactiveFrame, deltaTime: number): void;
  resize(width: number, height: number): void;
  stop(): void;
}
