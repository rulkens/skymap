/**
 * One request object per tier, allocated once, so the demand loop's compare of
 * `req(tier)` against the slot's committed request takes `sameRequest`'s `Object.is`
 * fast path.
 */

import { HI_RES_LAYER_SIDE_BY_TIER } from './sources';
import type { Tier } from '../@types/data/Tier';
import type { HiResFamousReq } from '../@types/loading/HiResFamousReq';

export const HI_RES_REQ_BY_TIER: Readonly<Record<Tier, HiResFamousReq>> = {
  small: { layerSide: HI_RES_LAYER_SIDE_BY_TIER.small },
  medium: { layerSide: HI_RES_LAYER_SIDE_BY_TIER.medium },
  large: { layerSide: HI_RES_LAYER_SIDE_BY_TIER.large },
};
