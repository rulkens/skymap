/**
 * SampledDepthKmFrame — how a fragment turns a sampled scene-depth texel into
 * a distance: the inverse MVP of the body row that stamped that depth, and the
 * camera in that row's own frame. Both are KM-scaled (the row's metre model
 * scaled by 1000), so a reconstructed distance compares directly against the km
 * the overlays and trails already measure their subjects in.
 */

import type { Vec3 } from '../math/Vec3';

export type SampledDepthKmFrame = { readonly invMvp: Float32Array; readonly camPosKm: Vec3 };
