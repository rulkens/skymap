import type { FrameReadoutRow } from '../../../../@types/engine/frame/FrameReadoutRow';
import { scaleReadoutRow } from './scaleReadoutRow';
import { bodyDistanceReadoutRow } from './bodyDistanceReadoutRow';

/** Every per-frame store readout, walked once per booted frame by `runFrame`. */
export const FRAME_READOUT_ROWS: readonly FrameReadoutRow[] = [
  scaleReadoutRow,
  bodyDistanceReadoutRow,
];
