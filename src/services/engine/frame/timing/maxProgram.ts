/**
 * MAX_PROGRAM — the maximal `FRAME_ORDER` expansion every timing projection
 * walks. One expansion, so they cannot disagree about which steps exist.
 */

import type { FrameStep } from '../../../../@types/engine/frame/FrameStep';
import { expandFrameOrder } from '../expandFrameOrder';
import { FRAME_ORDER } from '../frameOrder';
import { CONTENT_PASSES } from '../passes';
import { MAX_FRAME_INPUTS } from './maxFrameInputs';

export const MAX_PROGRAM: readonly FrameStep[] = expandFrameOrder(
  FRAME_ORDER,
  CONTENT_PASSES,
  MAX_FRAME_INPUTS,
);
