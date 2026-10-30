import type { FadeBand } from '../../../@types/math/FadeBand';
import type { CaptionKind } from '../../../services/engine/presentation/captionPriority';

/** One captioned seeded catalog's caption look: its declutter kind, and the reveal band its
 *  captions carry when their fade keys on each star's own distance from the eye. */
export type StarCaptionStyle = {
  readonly kind: CaptionKind;
  readonly revealBand?: FadeBand;
};
