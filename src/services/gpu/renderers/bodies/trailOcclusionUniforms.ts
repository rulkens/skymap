/**
 * trailOcclusionUniforms — the TS packer for `OcclusionUniforms` in
 * `shaders/lib/trailOcclusion.wesl`: `count` (u32) + three pad words, then
 * MAX_ORBIT_OCCLUDERS vec4s, then the sampled depth row's frame — its inverse
 * MVP, its camera (vec3, padded to 16), and the viewport the fragment divides
 * its pixel by (vec2, padded to 16). The ONE TS home for the byte offsets;
 * pinned against the struct by orbitTrailConstants.parity.test.ts, since a
 * silent drift here writes the spheres where the shader reads padding.
 * @module
 */

import type { TrailOcclusionUniforms } from '../../../../@types/rendering/TrailOcclusionUniforms';
import { MAX_ORBIT_OCCLUDERS } from '../../../../data/bodies/orbitTrailConstants';

export const OCCLUDER_COUNT_OFFSET = 0;
export const OCCLUDER_SPHERES_OFFSET = 16;
export const OCCLUDER_INV_MVP_OFFSET = OCCLUDER_SPHERES_OFFSET + MAX_ORBIT_OCCLUDERS * 16;
export const OCCLUDER_CAM_POS_OFFSET = OCCLUDER_INV_MVP_OFFSET + 64; // mat4x4<f32>
export const OCCLUDER_VIEWPORT_OFFSET = OCCLUDER_CAM_POS_OFFSET + 16; // camPosKm (vec3) ends at 348; vec2 aligns to 8 → 352
export const OCCLUDER_UNIFORM_BYTES = OCCLUDER_VIEWPORT_OFFSET + 16; // vec2<f32> + pad

export function createTrailOcclusionUniforms(): TrailOcclusionUniforms {
  const scratch = new ArrayBuffer(OCCLUDER_UNIFORM_BYTES);
  const count = new Uint32Array(scratch, OCCLUDER_COUNT_OFFSET, 1);
  const spheres = new Float32Array(scratch, OCCLUDER_SPHERES_OFFSET, MAX_ORBIT_OCCLUDERS * 4);
  const invMvp = new Float32Array(scratch, OCCLUDER_INV_MVP_OFFSET, 16);
  const camPos = new Float32Array(scratch, OCCLUDER_CAM_POS_OFFSET, 3);
  const viewport = new Float32Array(scratch, OCCLUDER_VIEWPORT_OFFSET, 2);

  return {
    scratch,
    write(occluders, depthFrame, viewportPx) {
      const live = Math.min(occluders.count, MAX_ORBIT_OCCLUDERS);
      count[0] = live;
      spheres.set(occluders.spheresKm.subarray(0, live * 4));
      // A null frame always arrives with the far-cleared placeholder view,
      // so the fragment never reads invMvp/camPosKm in that case — skip them.
      if (depthFrame !== null) {
        invMvp.set(depthFrame.invMvp);
        camPos.set(depthFrame.camPosKm);
      }
      viewport[0] = viewportPx[0]!;
      viewport[1] = viewportPx[1]!;
    },
  };
}
