/**
 * fadeUniforms — canonical bind-group layout for the universal
 * @group(1) FadeUniforms binding.
 *
 * Why canonical (not `layout: 'auto'`)?
 *
 * Per CLAUDE.md → "WebGPU layout:'auto' bind groups don't cross
 * pipelines": auto-derived layouts are pipeline-specific identities.
 * Sharing one bind group across two auto-layout pipelines fails the
 * "group-equivalent" compatibility check at draw time. By building one
 * canonical layout at engine bootstrap and threading it into every
 * pipeline's `device.createPipelineLayout({ bindGroupLayouts: [...] })`,
 * we get a single layout identity that every consumer's bind groups
 * are valid against. No per-pipeline bind-group reconstruction.
 *
 * The buffer is fragment-stage-visible because points, filaments,
 * volumes, and labels all multiply opacity into fragment alpha. Adding
 * `GPUShaderStage.VERTEX` would make the binding available for vertex-
 * stage reads too — but no current consumer reads opacity in the
 * vertex stage, so we keep it fragment-only. (Volumes' raymarch is
 * fragment-stage; points compute the smoothstep in the fragment; etc.)
 */

import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';

export function createFadeUniformsBgl(device: GPUDevice): FadeUniformsBgl {
  return device.createBindGroupLayout({
    label: 'fadeUniforms-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  }) as FadeUniformsBgl;
}
