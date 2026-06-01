/**
 * focusUniforms — canonical bind-group layout for the @group(3)
 * FocusUniforms binding (cluster focus mode).
 *
 * Canonical, not `layout: 'auto'`: auto layouts don't cross pipelines
 * (see CLAUDE.md). One layout built at bootstrap is threaded into both
 * the points pipeline (binds the live focus buffer) and the pick pipeline
 * (binds a zeroed dummy so its explicit layout matches), keeping every
 * consumer's bind groups valid.
 *
 * The buffer is VERTEX-stage-visible (unlike fragment-stage FadeUniforms):
 * the focus alpha multiplier folds into `out.intensity` in the points
 * vertex stage, so the fragment never reads it.
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
