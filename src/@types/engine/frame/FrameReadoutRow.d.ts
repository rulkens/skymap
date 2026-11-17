import type { AppDispatch } from '../../../store/types';
import type { FrameReadoutCtx } from './FrameReadoutCtx';

/**
 * FrameReadoutRow — one engine fact published to the store once per booted
 * frame (the store-boundary rule: React never reads the engine snapshot). A
 * row owns its own dedup or throttle; `runFrame` walks `FRAME_READOUT_ROWS`.
 */
export type FrameReadoutRow = {
  readonly publish: (frame: FrameReadoutCtx, dispatch: AppDispatch) => void;
};
