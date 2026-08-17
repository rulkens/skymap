/**
 * clipRegistry / clipFactories — the id → `Clip` lookup `startClip(id)` resolves
 * against.
 *
 * ### Every clip is a builder over the clip-start instant
 *
 * A clip's opening pose can depend on the sim clock: `earthFlyout` opens on
 * Earth's LIVE position, which moves along its orbit as the clock advances. So
 * the source of truth is `clipFactories`, keyed `Record<ClipId, ClipFactory>`,
 * where every entry is `(simDays) => Clip`. Most clips open on fixed cosmic
 * structures or "from here" and ignore the argument (`() => staticClip`) — the
 * uniform shape keeps the play site a single table lookup with no per-clip
 * branch, and an instant-dependent clip is not a special case. Typed over
 * `ClipId`, so the table must cover every id and may use no key outside the
 * union; the compiler enforces both directions.
 *
 * The play path (`watchClipSaga`) freezes the sim clock at clip start and
 * resolves the factory at that frozen instant, so `earthFlyout` opens on the
 * Earth the frozen frame draws.
 *
 * ### `clipRegistry` — the static snapshot for listing/inspecting
 *
 * Consumers that only enumerate or path-inspect clips (the debug panels, the
 * clip-path inspector) never PLAY them, so the live instant is immaterial to
 * them: they need a representative `Clip` object, not a builder. `clipRegistry`
 * is those factories resolved once at the J2000 epoch — the "now" the static
 * scene has always shown — so those consumers keep a plain `Record<ClipId, Clip>`
 * and need no clock plumbing.
 */

import type { Clip } from '../../../@types/animation/Clip';
import type { ClipId } from '../../../@types/animation/ClipId';
import { CONST_J2000 } from '../../time/constJ2000';
import { cosmicFlows } from './cosmicFlows';
import { flyout } from './flyout';
import { earthFlyout } from './earthFlyout';
import { earthUniverseLoop } from './earthUniverseLoop';
import { flowOrbit } from './flowOrbit';
import { flyPathDemo } from './flyPathDemo';
import { famousFlythrough } from './famousFlythrough';
import { starSpiral } from './starSpiral';
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

export const clipFactories: Record<ClipId, (simDays: number) => Clip> = {
  cosmicFlows: () => cosmicFlows,
  flyout: () => flyout,
  // The only instant-dependent clips: they read Earth's position at `simDays`.
  earthFlyout,
  earthUniverseLoop,
  flowOrbit: () => flowOrbit,
  flyPathDemo: () => flyPathDemo,
  famousFlythrough: () => famousFlythrough,
  // Instant-dependent, like `earthFlyout`: opens on Earth's live position.
  starSpiral,
  tourOpeningTitle: () => tourOpeningTitle,
  tourYouAreHere: () => tourYouAreHere,
  tourYouAreHereDwell: () => tourYouAreHereDwell,
  tourApproachM31: () => tourApproachM31,
  tourLocalGroup: () => tourLocalGroup,
  tourNeighbourhoodReveal: () => tourNeighbourhoodReveal,
  tourNeighbourhood: () => tourNeighbourhood,
  tourApproachVirgo: () => tourApproachVirgo,
  tourLaniakea: () => tourLaniakea,
  tourCosmicWeb: () => tourCosmicWeb,
  tourCosmicWebDwell: () => tourCosmicWebDwell,
  tourCosmicFlows: () => tourCosmicFlows,
  tourEmptiness: () => tourEmptiness,
  tourDeepField: () => tourDeepField,
  tourTheEdge: () => tourTheEdge,
  tourHomeAgain: () => tourHomeAgain,
};

export const clipRegistry: Record<ClipId, Clip> = Object.fromEntries(
  (Object.keys(clipFactories) as ClipId[]).map((id) => [id, clipFactories[id](CONST_J2000)]),
) as Record<ClipId, Clip>;
