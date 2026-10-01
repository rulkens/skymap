/**
 * Takeover selectors — the read seam for the `takeover` slice: which source,
 * if any, currently owns the scene. `selectTourActive` (tour/selectors.ts)
 * derives from `selectTakeoverSource` rather than duplicating this read.
 */

import { takeoverRoute } from '../../store/constants';
import { FLY_TO_POSE_SEC } from '../../data/animation/clips/makers/flyToPoseClip';
import { EXHIBIT_COPY_LEAD_SEC } from '../../data/exhibits/exhibitCopyLeadSec';
import type { RootState } from '../../store/types';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';

export const selectTakeoverSource = (state: RootState): TakeoverSource | null =>
  state[takeoverRoute].active;

export const selectTakeoverActive = (state: RootState): boolean =>
  selectTakeoverSource(state) !== null;

/** A cut entry has already landed, so its copy shows at once. */
export const selectExhibitCopyDelaySec = (state: RootState): number => {
  const source = selectTakeoverSource(state);
  return source?.kind === 'exhibit' && source.entry === 'fly'
    ? FLY_TO_POSE_SEC - EXHIBIT_COPY_LEAD_SEC
    : 0;
};
