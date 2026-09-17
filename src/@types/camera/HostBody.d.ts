import type { BodyId } from '../data/body/BodyId';
import type { BodyState } from '../scene/BodyState';
import type { GroundRadiusLookup } from './GroundRadiusLookup';

/** The body a rung is currently anchored to, resolved for this frame. */
export type HostBody = {
  readonly id: BodyId;
  readonly state: BodyState;
  /** Datum radius, metres — SCENE_CELESTIAL_BODIES, never a bounding hull; the h/R bands read it. */
  readonly radiusM: number;
  /** The ground: what the descent floor stands off from, and what sites and pivots sit on. */
  readonly groundRadiusAtM: GroundRadiusLookup;
  /** Descent-floor multiple of the datum (`bodyStandoffRadii`); a body may override the global. */
  readonly standoffRadii: number;
};
