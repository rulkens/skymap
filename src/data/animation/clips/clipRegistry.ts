/**
 * clipRegistry — the id → `Clip` lookup `startClip(id)` resolves against.
 *
 * Typed `Record<ClipId, Clip>`, so the registry must cover every `ClipId` and
 * may use no key outside the union — adding a clip is a two-line change (its id
 * in `ClipId`, its entry here) that the compiler enforces in both directions. A
 * data table, not a switch: `watchClipSaga` indexes it with the dispatched id,
 * no control-flow edit per clip.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { ClipId } from '../../../@types/animation/ClipId';
import { cosmicFlows } from './cosmicFlows';
import { flyout } from './flyout';
import { flowOrbit } from './flowOrbit';
import { flyPathDemo } from './flyPathDemo';
import { famousFlythrough } from './famousFlythrough';
import {
  tourOpeningTitle,
  tourYouAreHere,
  tourYouAreHereDwell,
  tourApproachM31,
  tourNeighbourhood,
  tourApproachVirgo,
} from './grandTourBeats';

export const clipRegistry: Record<ClipId, Clip> = {
  cosmicFlows,
  flyout,
  flowOrbit,
  flyPathDemo,
  famousFlythrough,
  tourOpeningTitle,
  tourYouAreHere,
  tourYouAreHereDwell,
  tourApproachM31,
  tourNeighbourhood,
  tourApproachVirgo,
};
