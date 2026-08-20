/**
 * sourceUniforms — canonical bind-group layout for the points-only
 * @group(2) SourceUniforms binding.
 *
 * Used by both the visual GalaxyPointRenderer pipeline and the offscreen
 * GalaxyPickRenderer pipeline. Sharing the layout identity means each
 * per-source SourceUniforms bind group built against this layout is
 * valid for either pipeline. See CLAUDE.md → "WebGPU layout:'auto'
 * bind groups don't cross pipelines" for the underlying rationale.
 *
 * Vertex-stage visibility because the points vertex stage reads
 * `source.sourceCode` to compose '(sourceCode << 26u) | instance_index'.
 * The fragment stages (color + pick) don't read this binding directly,
 * but the pipeline layout must list every binding the shader modules
 * declare — the pick fragment relies on the vertex's packSelection
 * output through VSOut.instanceIdx.
 */

import type { SourceUniformsBgl } from '../../../@types/rendering/SourceUniformsBgl';

export function createSourceUniformsBgl(device: GPUDevice): SourceUniformsBgl {
  return device.createBindGroupLayout({
    label: 'sourceUniforms-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
    ],
  }) as SourceUniformsBgl;
}
