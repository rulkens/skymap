import type { RecognizerState } from '../../@types/input/RecognizerState';

export function initialRecognizerState(): RecognizerState {
  return {
    widthPx: 0,
    heightPx: 0,
    pointers: new Map(),
    held: null,
    pair: null,
    pairBroken: false,
    lastTap: null,
  };
}
