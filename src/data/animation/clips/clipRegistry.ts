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
import { CONST_J2000 } from '../../time/constJ2000';
import { cosmicFlows } from './cosmicFlows';
import { flyout } from './flyout';
import { earthFlyout } from './earthFlyout';
import { flowOrbit } from './flowOrbit';
import { flyPathDemo } from './flyPathDemo';
import { famousFlythrough } from './famousFlythrough';
import {
  tourOpeningTitle,
  tourYouAreHere,
  tourYouAreHereDwell,
  tourApproachM31,
  tourLocalGroup,
  tourNeighbourhoodReveal,
  tourNeighbourhood,
  tourApproachVirgo,
  tourLaniakea,
  tourCosmicWeb,
  tourCosmicWebDwell,
  tourCosmicFlows,
  tourEmptiness,
  tourDeepField,
  tourTheEdge,
  tourHomeAgain,
} from './grandTourBeats';

export const clipRegistry: Record<ClipId, Clip> = {
  cosmicFlows,
  flyout,
  // `earthFlyout` opens on Earth's LIVE position, so it is a builder over the
  // clip-start instant (not a static pose). This pure-data registry has no store
  // or engine-state access — the single-writer frozen instant lives on
  // `state.cameraRuntime` / the `time` slice, reachable only at the play site —
  // so the registry entry is built at the J2000 epoch. The play path
  // (`watchClipSaga`, which freezes the clock at clip start) is where the frozen
  // instant should be injected; wiring that lives outside this task's fenced
  // surface. See the report's concerns.
  earthFlyout: earthFlyout(CONST_J2000),
  flowOrbit,
  flyPathDemo,
  famousFlythrough,
  tourOpeningTitle,
  tourYouAreHere,
  tourYouAreHereDwell,
  tourApproachM31,
  tourLocalGroup,
  tourNeighbourhoodReveal,
  tourNeighbourhood,
  tourApproachVirgo,
  tourLaniakea,
  tourCosmicWeb,
  tourCosmicWebDwell,
  tourCosmicFlows,
  tourEmptiness,
  tourDeepField,
  tourTheEdge,
  tourHomeAgain,
};
