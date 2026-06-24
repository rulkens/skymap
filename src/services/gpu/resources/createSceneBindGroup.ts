/**
 * createSceneBindGroup — assemble the @group(3) per-frame scene-state bind
 * group from the engine-owned buffers that co-tenant it.
 *
 * The scene group hosts the once-per-frame, vertex-stage, global modifiers of
 * the galaxy scene: cluster focus (binding 0) and the gravitational-lensing
 * lens array (binding 1). They share a group only because WebGPU caps a
 * pipeline at 4 bind groups and points + pick already use all four — see
 * `createSceneUniformsBgl` for the co-tenancy rationale.
 *
 * The concerns stay independent in data: each buffer is allocated, owned, and
 * written by its own factory (`createFocusUniformBuffer`,
 * `createLensingUniformBuffer`). This assembler only references them, so it is
 * the single place the group's composition lives — and the place the next
 * tenant (the lensing LUT texture + sampler) is added, without touching either
 * buffer's factory. A bind group is not a destroyable resource; the buffers it
 * references are released by their owners.
 */

import type { SceneUniformsBgl } from '../../../@types/rendering/SceneUniformsBgl';

export function createSceneBindGroup(
  device: GPUDevice,
  sceneBgl: SceneUniformsBgl,
  focusBuffer: GPUBuffer,
  lensingBuffer: GPUBuffer,
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
    ],
  });
}
