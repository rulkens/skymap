/**
 * focusUniforms — canonical bind-group layout for the @group(3)
 * per-frame galaxy-scene-state group: cluster-focus dim (binding 0) +
 * gravitational-lensing deflection (binding 1).
 *
 * Canonical, not `layout: 'auto'`: auto layouts don't cross pipelines
 * (see CLAUDE.md). One layout built at bootstrap is threaded into every
 * galaxy-rendering pipeline — points (@group(3)), the impostor disks
 * (@group(1)), and the pick pipeline — and the single shared scene-state
 * bind group, built against this layout, binds in all of them (a bind
 * group is tied to a layout, not a group number).
 *
 * ## Why lensing rides binding 1 here rather than its own @group
 *
 * Both focus and lensing are once-per-frame, vertex-stage global
 * modifiers of every galaxy. WebGPU caps a pipeline at 4 bind groups and
 * the points + pick pipelines already use all four (uniforms, fade,
 * source, focus) — so a dedicated 5th group for lensing is invalid (and
 * iOS is stricter still). Group 0 is the shared camera group that the
 * secondary pick renderers (structure rings, Milky-Way) reuse, so it's
 * the wrong home. Group 3 is the only group those pickers don't touch,
 * which makes co-hosting lensing here ripple to nothing else. Both
 * bindings are VERTEX-only: focus folds into per-vertex intensity, the
 * lens array deflects each source's billboard — the fragment stages read
 * only results, never these uniforms. The disk pipelines inherit the
 * lensing binding unused today, which also pre-wires them for lensed
 * impostors later. (The volume raymarch reads the SAME lensing buffer via
 * its own standalone VERTEX|FRAGMENT BGL — see lensingUniforms.ts.)
 */

import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';

export function createFocusUniformsBgl(device: GPUDevice): FocusUniformsBgl {
  return device.createBindGroupLayout({
    label: 'focusUniforms-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
      // binding 1: the shared LensingUniforms buffer. See the docblock
      // above for why lensing co-hosts the focus group instead of its own.
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
  }) as FocusUniformsBgl;
}
