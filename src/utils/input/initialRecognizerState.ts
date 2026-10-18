import type { RecognizerState } from '../../@types/input/RecognizerState';

export function initialRecognizerState(): RecognizerState {
  return {
    widthPx: 0,
    heightPx: 0,
    pointers: new Map(),
    held: null,
    pinching: false,
    pinchSpanPx: 0,
    pinchBroken: false,
    lastTap: null,
  };
}
