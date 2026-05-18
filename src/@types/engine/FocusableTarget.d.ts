import type { GalaxyInfo } from './GalaxyInfo';
import type { PointOfInterest } from './subsystems/PointOfInterest';

/**
 * FocusableTarget — discriminated union of the two things the camera can
 * focus on: a single galaxy point or a point-of-interest anchor (cluster,
 * supercluster, void, famous-galaxy POI).
 *
 * Used by the public `camera.focusOn(target)` handle (which dispatches via
 * the `isPoi` predicate in `services/engine/isPoi.ts`) and by InfoCard's
 * unified `hovered` / `selected` props.  Deliberately distinct from
 * `FocusTarget` in `@types/camera/FocusTarget.d.ts`, which is the
 * URL-parsed deep-link descriptor (`{ kind: 'pgc' | 'objid' | 'famous', ...}`)
 * — that one is a *request* to find a target; this one is the *resolved*
 * target itself.
 */
export type FocusableTarget = GalaxyInfo | PointOfInterest;
