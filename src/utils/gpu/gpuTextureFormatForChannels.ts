/**
 * gpuTextureFormatForChannels — map a scalar-field cube's channel count
 * to the WebGPU texture format the renderer must allocate.
 *
 * Single source of truth shared by the SCFD loader and the tests — the
 * decoder deliberately derives *nothing* about the GPU format itself, so
 * the 1↔r16float / 4↔rgba16float mapping lives here rather than being
 * re-derived (and risking drift) at each call site.  Throws on any other
 * value so an out-of-contract channel count fails loudly at the boundary
 * rather than silently picking a wrong format.
 */

export function gpuTextureFormatForChannels(channels: 1 | 4): GPUTextureFormat {
  if (channels === 1) return 'r16float';
  if (channels === 4) return 'rgba16float';
  throw new Error(
    `gpuTextureFormatForChannels: unsupported channel count ${channels} (expected 1 or 4)`,
  );
}
