/**
 * One request object per tier, allocated once. The demand loop compares a row's
 * `req(tier)` against the slot's committed request; a fresh object per call would
 * still compare equal field-wise, but a shared constant makes the compare an
 * identity hit and keeps the per-tier sides stated in exactly one place.
 */

import { HI_RES_LAYER_SIDE_BY_TIER } from './sources';
import type { Tier } from '../@types/data/Tier';
import type { HiResFamousReq } from '../@types/loading/HiResFamousReq';

export const HI_RES_REQ_BY_TIER: Readonly<Record<Tier, HiResFamousReq>> = {
  small: { layerSide: HI_RES_LAYER_SIDE_BY_TIER.small },
  medium: { layerSide: HI_RES_LAYER_SIDE_BY_TIER.medium },
  large: { layerSide: HI_RES_LAYER_SIDE_BY_TIER.large },
};
