/**
 * isMilkyWayCloudLive — the ONE rule for "does the point cloud draw this
 * frame": its renderer part is on and its alpha is above 0. The aggregate
 * producer and the upsample consumer both gate on it, so the upsample never
 * composites an offscreen nobody wrote; the dust pass narrows it with
 * `cloudDust`.
 */
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../../@types/engine/frame/PassState';
import { deriveMilkyWayCloudAlpha } from './deriveMilkyWayCloudAlpha';
import { selectMilkyWayParts } from '../../state/milkyWay/selectors';

export function isMilkyWayCloudLive(
  state: PassState,
  ctx: FrameView,
  fade: number,
  pickCode: number,
): boolean {
  return (
    selectMilkyWayParts(state.settings.milkyWay).cloud &&
    deriveMilkyWayCloudAlpha(ctx, fade, pickCode) !== null
  );
}
