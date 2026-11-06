/**
 * One wheel-out notch past the widest lens (spec §6.1): it adds ln f to the
 * push, or starts it over from ln f after a pause of SKY_EXIT_PUSH_DECAY_MS.
 * The notch spends what the lens would (`spentZoomFactor`), so one frame's
 * folded fling cannot lift the eye on its own.
 */

import type { SkyExitPush } from '../../../../../../@types/camera/arms/SkyExitPush';
import { SKY_EXIT_PUSH_DECAY_MS } from '../data/skyExitPushDecayMs';
import { spentZoomFactor } from '../../../input/utils/spentZoomFactor';

export function skyExitPushStep(push: SkyExitPush, factor: number, nowMs: number): SkyExitPush {
  const carried = nowMs - push.lastPushMs < SKY_EXIT_PUSH_DECAY_MS ? push.pushLn : 0;
  return { pushLn: carried + Math.log(spentZoomFactor(factor)), lastPushMs: nowMs };
}
