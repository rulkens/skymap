import type { FadeBand } from '../../../../@types/math/FadeBand';

/** One captioned seeded catalog's caption look: its declutter priority, and the reveal band its
 *  captions carry when their fade keys on each star's own distance from the eye. */
export type StarCaptionStyle = {
  readonly priority: number;
  readonly revealBand?: FadeBand;
};
