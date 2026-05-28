import type { FamousMetaEntry } from '../loading/FamousMetaEntry';

export type UseFamousMetaReturn = {
  famousMeta: readonly FamousMetaEntry[];
  /**
   * True once the famous-meta fetch has settled (success OR swallowed
   * error).  Splash gating reads this to know when the Tour CTA can
   * activate.  Mirrors the fail-soft UX: a missing famous_meta.json
   * still flips `ready` to true (with empty meta array) so the splash
   * doesn't deadlock on a deployment that hasn't shipped the sidecar.
   */
  ready: boolean;
};
