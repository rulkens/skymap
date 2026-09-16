/**
 * MAX_PROGRAM — the maximal `FRAME_ORDER` expansion every timing projection
 * walks. One expansion, so they cannot disagree about which steps exist.
 */

import type { FrameStep } from '../../../../@types/engine/frame/FrameStep';
import { expandFrameOrder } from '../expandFrameOrder';
import { FRAME_ORDER } from '../frameOrder';
import { FRAME_ORDER_PASS_NAMES } from '../frameOrderPassNames';
import { MAX_FRAME_INPUTS } from './maxFrameInputs';

export const MAX_PROGRAM: readonly FrameStep[] = expandFrameOrder(
  FRAME_ORDER,
  // Name-only stubs: every projection downstream reads `contentPass.name` and
  // nothing else, and a MAXIMAL program must cover every authored name however
  // few of them a given composition contributes. The two members are inert so
  // a stub reaching a real encoder would draw nothing rather than throw.
  FRAME_ORDER_PASS_NAMES.map((name) => ({ name, enabled: () => false, draw: () => {} })),
  MAX_FRAME_INPUTS,
);
