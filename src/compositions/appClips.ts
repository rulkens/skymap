/**
 * APP_CLIP_FACTORIES / APP_CLIP_REGISTRY — the id → `Clip` lookup `startClip(id)` resolves against.
 *
 * Adding a clip is one row here: `ClipId` is `keyof` this table. Every row is `(simDays) => Clip`
 * because `earthFlyout` and its kin open on a body's position at clip start; the uniform shape keeps
 * the play site (`clipBodySaga`, which resolves at the frozen clip-start instant) one lookup.
 *
 * `APP_CLIP_REGISTRY` is the same rows resolved at J2000, for readers that list or path-inspect
 * clips without playing them and so need no clock.
 */

import type { Clip } from '../@types/animation/Clip';
import type { ClipId } from '../@types/animation/ClipId';
import { CONST_J2000 } from '../data/time/constJ2000';
import { cosmicFlows } from './clips/cosmicFlows';
import { flyout } from './clips/flyout';
import { earthFlyout } from './clips/earthFlyout';
import { earthCosmicWebLoop } from './clips/earthCosmicWebLoop';
import { earthUniverseLoop } from './clips/earthUniverseLoop';
import { sondermarkenFlyout } from './clips/sondermarkenFlyout';
import { perseveranceToSondermarken } from './clips/perseveranceToSondermarken';
import { flowOrbit } from './clips/flowOrbit';
import { flyPathDemo } from './clips/flyPathDemo';
import { famousFlythrough } from './clips/famousFlythrough';
import {
  tourParkOpening,
  tourParkOpeningDwell,
  tourYouAreHereEarth,
  tourYouAreHereEarthDwell,
  tourEarthAndMoon,
  tourEarthAndMoonDwell,
  tourSolarSystem,
  tourSolarSystemDwell,
  tourStellarNeighbourhood,
  tourStellarNeighbourhoodDwell,
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
} from './clips/grandTourBeats';

export const APP_CLIP_FACTORIES = {
  cosmicFlows: () => cosmicFlows,
  flyout: () => flyout,
  // The only instant-dependent clips: they read body positions at `simDays`.
  earthFlyout,
  sondermarkenFlyout,
  perseveranceToSondermarken,
  earthUniverseLoop,
  earthCosmicWebLoop,
  flowOrbit: () => flowOrbit,
  flyPathDemo: () => flyPathDemo,
  famousFlythrough: () => famousFlythrough,
  tourParkOpening: () => tourParkOpening,
  tourParkOpeningDwell: () => tourParkOpeningDwell,
  tourYouAreHereEarth: () => tourYouAreHereEarth,
  tourYouAreHereEarthDwell: () => tourYouAreHereEarthDwell,
  tourEarthAndMoon: () => tourEarthAndMoon,
  tourEarthAndMoonDwell: () => tourEarthAndMoonDwell,
  tourSolarSystem: () => tourSolarSystem,
  tourSolarSystemDwell: () => tourSolarSystemDwell,
  tourStellarNeighbourhood: () => tourStellarNeighbourhood,
  tourStellarNeighbourhoodDwell: () => tourStellarNeighbourhoodDwell,
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
} satisfies Record<string, (simDays: number) => Clip>;

export const APP_CLIP_REGISTRY: Record<ClipId, Clip> = Object.fromEntries(
  (Object.keys(APP_CLIP_FACTORIES) as ClipId[]).map((id) => [
    id,
    APP_CLIP_FACTORIES[id](CONST_J2000),
  ]),
) as Record<ClipId, Clip>;
