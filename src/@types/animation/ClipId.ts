/**
 * ClipId — the stable string id of a clip in the clip registry.
 *
 * A closed string-literal union rather than a bare `string`: every authored
 * clip is named here, and `clipRegistry` is typed `Record<ClipId, Clip>`, so
 * the union and the registry check against each other in both directions.
 * Adding a clip means adding its id here AND a registry entry — TypeScript fails
 * the build if either is missing — and `startClip(id)` only accepts a real id.
 *
 * Mirrors `TourId`; see that file for the append-only rationale.
 */
export type ClipId =
  | 'cosmicFlows'
  | 'flyout'
  | 'earthFlyout'
  | 'earthUniverseLoop'
  | 'flowOrbit'
  | 'flyPathDemo'
  | 'famousFlythrough'
  | 'starSpiral'
  | 'tourOpeningTitle'
  | 'tourYouAreHere'
  | 'tourYouAreHereDwell'
  | 'tourApproachM31'
  | 'tourNeighbourhood'
  | 'tourApproachVirgo'
  | 'tourLaniakea'
  | 'tourCosmicWeb'
  | 'tourCosmicWebDwell'
  | 'tourCosmicFlows'
  | 'tourEmptiness'
  | 'tourDeepField'
  | 'tourTheEdge'
  | 'tourHomeAgain'
  | 'tourLocalGroup'
  | 'tourNeighbourhoodReveal';
