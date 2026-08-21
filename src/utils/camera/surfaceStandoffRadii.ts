/**
 * SURFACE_STANDOFF_RADII — where the camera stops relative to the pivot's
 * surface, as a multiple of its radius. Applied to the EYE, by
 * `cursorZoomStep`/`zoomedEyeStep`: the orbit `distance` is measured to a pivot
 * that a pan or a zoom-to-cursor strafes off centre, so it is not a currency
 * this ratio means anything in.
 *
 * Sized for the 0.15 m/texel EOX imagery — ~15 m of altitude gets close enough
 * to resolve it, while staying above the surface shading's own
 * ~10 m hard limit: `earth/fragment.wesl`'s ocean-glint view vector is
 * `u.camPosLocal - in.normalLocal`, both ~1.0-magnitude f32 values in the
 * unit-sphere local frame, so this is a near-cancellation whose headroom gets
 * thin below ~10 m of altitude — no depth-buffer floor to raise, an f32
 * subtraction floor. Must stay strictly above 1.0: the standoff needs a
 * horizon — `cutSurfaceTiles` returns an empty plan at or below 1.0 radii,
 * where there is none to plan against.
 *
 * The near plane no longer couples to this ratio directly: `deriveSlabs`
 * (`slabs.ts`) keys `foregroundFrustum`'s bracket off the EYE's altitude
 * rather than raw distance, so the floors compare directly — this must stay
 * comfortably above `foregroundFrustum.ts: MIN_NEAR_MPC` (~6 m) or the near
 * plane clips the ground, as `20fed8e31` found the hard way.
 *
 * A RATIO applies the same floor to every body, which was only validated
 * visually over Earth. Revisit if a close Moon/Sun approach looks wrong.
 */
export const SURFACE_STANDOFF_RADII = 1.0000024;
