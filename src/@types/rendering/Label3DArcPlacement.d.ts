import type { Vec3 } from '../math/Vec3';

/**
 * Label3DArcPlacement — the circle a `Label3D`'s lettering runs along:
 * centre, plane, in-plane zero direction, radius, and the first repeat's
 * start angle (spec §3.2).
 *
 * LANDMINE — handedness is load-bearing. `label3DRenderer`'s vertex stage
 * derives the in-plane binormal as `cross(planeNormal, referenceDir)`. Get
 * that order backwards and the lettering renders MIRRORED (right-to-left).
 * The Zone-of-Avoidance instance (`referenceDir = GAL_X_EQ`, `planeNormal =
 * GAL_Z_EQ`) reproduces `GAL_Y_EQ` exactly (`GAL_X × GAL_Y = GAL_Z`,
 * right-handed) — the sign derivation `shaders/labels3d/vertex.wesl`
 * documents at its glyph anchor (`angle − arcRad`, not `+`) depends on this
 * exact cross-product order.
 */
export type Label3DArcPlacement = {
  /** Centre of the circle the text runs along, in world space. */
  readonly center: Vec3;
  /** Unit normal of the circle's plane; also the text's local "up". */
  readonly planeNormal: Vec3;
  /** Unit in-plane direction of angle 0. MUST be perpendicular to planeNormal. */
  readonly referenceDir: Vec3;
  readonly radiusMpc: number;
  /** Angle of the first repeat's pen centre, measured from referenceDir. */
  readonly startAngleRad: number;
};
