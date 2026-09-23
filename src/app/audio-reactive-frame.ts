export interface AudioReactiveFrame {
  volume: number;
  bass: number;
  mid: number;
  high: number;
  energy: number;
  beat: boolean;
  beatStrength: number;
}

export const EMPTY_AUDIO_FRAME: AudioReactiveFrame = {
  volume: 0,
  bass: 0,
  mid: 0,
  high: 0,
  energy: 0,
  beat: false,
  beatStrength: 0,
};
