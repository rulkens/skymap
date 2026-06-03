/**
 * focusUniforms — canonical bind-group layout for the FocusUniforms
 * binding (cluster focus mode).
 *
 * Canonical, not `layout: 'auto'`: auto layouts don't cross pipelines
 * (see CLAUDE.md). One layout built at bootstrap is threaded into every
 * focus-aware pipeline — points (@group(3)), the impostor disks (@group(1)),
 * and the pick pipeline — and the single shared focus bind group, built
 * against this layout, binds in all of them (a bind group is tied to a
 * layout, not a group number).
 *
 * The buffer is VERTEX-stage-visible (unlike fragment-stage FadeUniforms):
 * the focus alpha multiplier folds into the per-vertex intensity (points)
 * or a forwarded per-instance `focusDim` (disks), so the fragment stage
 * reads only the result, never the uniform.
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
    ],
  }) as FocusUniformsBgl;
}
