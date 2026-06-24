/**
 * lensingUniforms — canonical bind-group layout for the LensingUniforms
 * binding (gravitational-lensing lens array + profile knobs).
 *
 * Canonical, not `layout: 'auto'`: auto layouts don't cross pipelines
 * (see CLAUDE.md). One layout built at bootstrap is threaded into every
 * lensing-aware pipeline. Today's only consumer that uses this standalone
 * BGL directly is the RESERVED volume-raymarch path (`createLensingUniformBuffer`);
 * the points and pick pipelines read the same buffer via the shared scene
 * group at @group(3) @binding(1) (not via this BGL directly). The single
 * shared lensing bind group, built against this layout, is valid for that
 * path (a bind group is tied to a layout, not a group number).
 *
 * The buffer is visible to BOTH the vertex and fragment stages: the points
 * vertex stage reads the lens array to deflect each source, and the volume
 * raymarch will read it in the fragment stage to bend the ray. Declaring
 * both visibilities here (rather than VERTEX-only like FocusUniforms) keeps
 * the layout valid for the fragment-stage consumer without a second BGL.
 */

import type { LensingUniformsBgl } from '../../../@types/rendering/LensingUniformsBgl';

export function createLensingUniformsBgl(device: GPUDevice): LensingUniformsBgl {
  return device.createBindGroupLayout({
    label: 'lensingUniforms-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  }) as LensingUniformsBgl;
}
