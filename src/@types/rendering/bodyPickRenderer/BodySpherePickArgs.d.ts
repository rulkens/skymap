import type { Vec3 } from '../../math/Vec3';

/**
 * One sphere body's pick draw: its CPU-baked model-view-projection (16 f32,
 * column-major — the exact matrix `composeBodyMvp` narrows for the visual
 * sibling, so the pick sphere is silhouette-identical to the visual one), the
 * camera in that same body-local frame, and the fully-packed identity the
 * fragment stamps.
 *
 * `mvp` and `camPosLocal` are a PAIR and must be composed from the one radius:
 * the mvp's model scale defines the frame, and `camPosLocal` is a position
 * measured in it. `drawFlooredSpherePick` computes both from its single
 * `pickRadiusMpc` local, which is what keeps them from drifting.
 */
export type BodySpherePickArgs = {
  /** Column-major MVP (16 f32), camera-relative, narrowed from f64. */
  readonly mvp: Float32Array;
  /** Camera in the body's local frame, in FLOORED-pick-radius units — the ray origin. */
  readonly camPosLocal: Readonly<Vec3>;
  /** Fully-packed pick id (`packSelection(code, seedIndex + offset)`). */
  readonly packedId: number;
};
