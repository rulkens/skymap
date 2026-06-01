/**
 * focusUniforms — canonical bind-group layout for the @group(3)
 * FocusUniforms binding (cluster focus mode).
 *
 * Why canonical (not `layout: 'auto'`)? Same reason as fadeUniforms:
 * per CLAUDE.md → "WebGPU layout:'auto' bind groups don't cross
 * pipelines". One canonical layout built at bootstrap is threaded into
 * both the points pipeline (binds the live focus buffer) and the pick
 * pipeline (binds a zeroed dummy so its explicit layout matches). A
 * single layout identity keeps every consumer's bind groups valid.
 *
 * The buffer is VERTEX-stage-visible — unlike FadeUniforms (fragment).
 * The focus alpha multiplier is folded into `out.intensity` in the
 * points vertex stage (see points/vertex.wesl), so the fragment never
 * reads it.
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
