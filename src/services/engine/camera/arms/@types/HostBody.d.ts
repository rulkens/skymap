import type { SceneBodyId } from '../../../../../@types/scene/SceneBodyId';
import type { BodyState } from '../../../../../@types/scene/BodyState';
import type { GroundRadiusLookup } from '../../../../../@types/camera/terrain/GroundRadiusLookup';

/** The body an arm is currently anchored to, resolved for this frame. */
export type HostBody = {
  readonly id: SceneBodyId;
  readonly state: BodyState;
  /** Datum radius, metres — SCENE_CELESTIAL_BODIES, never a bounding hull; the h/R bands read it. */
  readonly radiusM: number;
  /** The ground: what the descent floor stands off from. */
  readonly groundRadiusAtM: GroundRadiusLookup;
  /** Terrain cannot lie outside these, whatever has streamed in — they come from
   *  `BodySurface.reliefM`, declared per-body data, not from a tile header. A ray pick
   *  marches between them (spec §8.1); nothing may read either as a datum. */
  readonly innerBoundRadiusM: number;
  readonly outerBoundRadiusM: number;
  /** Descent-floor multiple of the datum (`bodyStandoffRadii`); a body may override the global. */
  readonly standoffRadii: number;
};
