import type { FamousStarMetaEntry } from '../loading/FamousStarMetaEntry';

export type UseFamousStarsMetaReturn = {
  famousStarsMeta: readonly FamousStarMetaEntry[];
  /**
   * True once the famous-stars-meta fetch has settled (success OR
   * swallowed error).  Mirrors the galaxy `UseFamousMetaReturn` fail-soft
   * UX: a missing `famous_stars_meta.json` still flips `ready` to true
   * (with an empty meta array) so a card render or splash gate never
   * deadlocks on a deployment that hasn't shipped the sidecar.
   */
  ready: boolean;
};
