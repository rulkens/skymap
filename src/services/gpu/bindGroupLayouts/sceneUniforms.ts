/**
 * sceneUniforms — canonical bind-group layout for the @group(3) per-frame
 * scene-state group: the once-per-frame, vertex-stage, global modifiers of
 * the galaxy scene. Cluster-focus dim (binding 0) + gravitational-lensing
 * deflection (binding 1) + the inverse-NFW-lens LUT texture (binding 2) +
 * its linear sampler (binding 3).
 *
 * The group is named for that boundary, not for any one tenant — focus is one
 * member, not the group's identity. Canonical, not `layout: 'auto'`: auto
 * layouts don't cross pipelines (see CLAUDE.md). One layout built at bootstrap
 * is threaded into every galaxy-rendering pipeline — points (@group(3)), the
 * impostor disks (@group(1)), and the pick pipeline — and the single shared
 * scene bind group (`createSceneBindGroup`), built against this layout, binds
 * in all of them (a bind group is tied to a layout, not a group number).
 *
 * ## Why lensing rides this group rather than its own @group
 *
 * WebGPU caps a pipeline at 4 bind groups and the points + pick pipelines
 * already use all four (uniforms, fade, source, scene) — so a dedicated 5th
 * group for lensing is invalid (and iOS is stricter still). Group 0 is the
 * shared camera group that the secondary pick renderers (structure rings,
 * Milky-Way) reuse, so it's the wrong home. Group 3 is the only group those
 * pickers don't touch, which makes co-hosting lensing here ripple to nothing
 * else. All four bindings are VERTEX-only: focus folds into per-vertex
 * intensity; the lens array deflects each source's billboard; the LUT texture
 * + sampler let the vertex stage invert the NFW lens equation cheaply. The
 * disk pipelines inherit the lensing bindings unused today, which also
 * pre-wires them for lensed impostors later. (The volume raymarch reads the
 * SAME lensing buffer via its own standalone VERTEX|FRAGMENT BGL — see
 * lensingUniforms.ts.)
 *
 * ## Why 'float' + 'filtering' for the LUT
 *
 * The LUT texture is `rgba16float`. WebGPU requires `sampleType: 'float'` (not
 * 'unfilterable-float') and `type: 'filtering'` on the sampler to allow linear
 * interpolation — `float32-filterable` is a non-universal device feature, but
 * f16 linear filtering is baseline. Mismatching the pair (e.g. 'non-filtering'
 * sampler with a 'float' texture) triggers a validation error at bind-group
 * creation time.
 */

import type { SceneUniformsBgl } from '../../../@types/rendering/SceneUniformsBgl';

export function createSceneUniformsBgl(device: GPUDevice): SceneUniformsBgl {
  return device.createBindGroupLayout({
    label: 'sceneUniforms-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
      // binding 1: the shared LensingUniforms buffer. See the docblock
      // above for why lensing co-hosts the scene group instead of its own.
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
      // binding 2: precomputed inverse-NFW-lens LUT (rgba16float texture_2d).
      // 'float' sampleType + 'filtering' sampler are the matched pair that
      // enables linear interpolation on f16 textures without requiring the
      // 'float32-filterable' device feature (see module docblock).
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX,
        texture: { sampleType: 'float', viewDimension: '2d' },
      },
      // binding 3: clamp-to-edge linear sampler for the NFW LUT above.
      {
        binding: 3,
        visibility: GPUShaderStage.VERTEX,
        sampler: { type: 'filtering' },
      },
    ],
  }) as SceneUniformsBgl;
}
