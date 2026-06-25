/**
 * createSceneBindGroup — assemble the @group(3) per-frame scene-state bind
 * group from the engine-owned buffers and textures that co-tenant it.
 *
 * The scene group hosts the once-per-frame, vertex-stage, global modifiers of
 * the galaxy scene: cluster focus (binding 0), the gravitational-lensing lens
 * array (binding 1), the precomputed NFW LUT texture (binding 2), and its
 * linear sampler (binding 3). They share a group because WebGPU caps a
 * pipeline at 4 bind groups and points + pick already use all four — see
 * `createSceneUniformsBgl` for the co-tenancy rationale.
 *
 * The concerns stay independent in data: each buffer and texture is allocated,
 * owned, and written/destroyed by its own factory. This assembler only
 * references them, so it is the single place the group's composition lives.
 * Pass the texture VIEW (not the texture) at binding 2 — a bind group entry
 * takes a `GPUTextureView`. A bind group is not a destroyable resource; the
 * resources it references are released by their owners.
 */

import type { SceneUniformsBgl } from '../../../@types/rendering/SceneUniformsBgl';

export function createSceneBindGroup(
  device: GPUDevice,
  sceneBgl: SceneUniformsBgl,
  focusBuffer: GPUBuffer,
  lensingBuffer: GPUBuffer,
  lensLutView: GPUTextureView,
  lensLutSampler: GPUSampler,
  label = 'scene',
): GPUBindGroup {
  return device.createBindGroup({
    label: `${label}-bg`,
    layout: sceneBgl,
    entries: [
      // binding 0: cluster-focus uniform (written once per frame).
      { binding: 0, resource: { buffer: focusBuffer } },
      // binding 1: shared gravitational-lensing buffer (written once per frame).
      { binding: 1, resource: { buffer: lensingBuffer } },
      // binding 2: inverse-NFW-lens LUT view (rgba16float texture_2d).
      { binding: 2, resource: lensLutView },
      // binding 3: clamp-to-edge linear sampler for the LUT above.
      { binding: 3, resource: lensLutSampler },
    ],
  });
}
