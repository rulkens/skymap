/**
 * Clip labels for the remote's buttons, a copy for the same reason as `remoteExhibitLabels`
 * (`clipRegistry` reaches the engine). `null` marks clips that are a tour's own beats or a
 * demo, which a remote does not start by themselves.
 */
import type { ClipId } from '../../@types/animation/ClipId';

export const REMOTE_CLIP_LABELS: Record<ClipId, string | null> = {
  cosmicFlows: 'Cosmic Flows',
  flyout: 'Fly to Horizon',
  earthFlyout: 'Earth to the Edge',
  sondermarkenFlyout: 'Søndermarken to the Edge',
  perseveranceToSondermarken: 'Perseverance to Søndermarken',
  earthUniverseLoop: 'Earth ⇄ Universe (loop)',
  earthCosmicWebLoop: 'Earth ⇄ Cosmic web (loop)',
  flowOrbit: 'Flow Orbit',
  flyPathDemo: null,
  famousFlythrough: 'Famous galaxies (grand tour)',
  tourOpeningTitle: null,
  tourYouAreHere: null,
  tourYouAreHereDwell: null,
  tourApproachM31: null,
  tourNeighbourhood: null,
  tourApproachVirgo: null,
  tourLaniakea: null,
  tourCosmicWeb: null,
  tourCosmicWebDwell: null,
  tourCosmicFlows: null,
  tourEmptiness: null,
  tourDeepField: null,
  tourTheEdge: null,
  tourHomeAgain: null,
  tourLocalGroup: null,
  tourNeighbourhoodReveal: null,
};
