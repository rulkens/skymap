/**
 * encodeGeneration — records the compute dispatches for one galaxy's star
 * and dust generation passes onto an existing `GPUCommandEncoder`.
 *
 * Bind groups are built HERE, at each pipeline, not once and reused:
 * `layout: 'auto'` derives a layout specific to the pipeline it came from,
 * even though the star and dust shaders declare byte-identical `@group(0)`
 * bindings — a bind group built against one pipeline's layout is invalid on
 * the other.
 *
 * The dust pass is skipped when `dustLayout.capacity === 0` (an
 * elliptical-gated empty layout, see `carveDustLayout`) — nothing to bind or
 * dispatch.
 */
import type { GenerationPipelines } from '../../../../@types/galaxy/GenerationPipelines';
import type { GenerationLayout } from '../../../../@types/galaxy/GenerationLayout';

/** Matches `@workgroup_size(256)` in both `generateStars.wesl` and `generateDust.wesl`. */
const WORKGROUP_SIZE = 256;

function dispatchCount(capacity: number): number {
  return Math.ceil(capacity / WORKGROUP_SIZE); // shader threads past capacity return immediately
}

export function encodeGeneration(args: {
  readonly device: GPUDevice;
  readonly encoder: GPUCommandEncoder;
  readonly pipelines: GenerationPipelines;
  readonly ubo: GPUBuffer;
  readonly starBuf: GPUBuffer;
  readonly starLayout: GenerationLayout;
  readonly dustBuf: GPUBuffer | null;
  readonly dustLayout: GenerationLayout;
}): void {
  const { device, encoder, pipelines, ubo, starBuf, starLayout, dustBuf, dustLayout } = args;

  const starBindGroup = device.createBindGroup({
    label: 'galaxy:genStarsBG',
    layout: pipelines.stars.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: ubo } },
      { binding: 1, resource: { buffer: starBuf } },
    ],
  });
  const starPass = encoder.beginComputePass({ label: 'galaxy:genStarsPass' });
  starPass.setPipeline(pipelines.stars);
  starPass.setBindGroup(0, starBindGroup);
  starPass.dispatchWorkgroups(dispatchCount(starLayout.capacity));
  starPass.end();

  if (dustLayout.capacity === 0 || !dustBuf) return;

  const dustBindGroup = device.createBindGroup({
    label: 'galaxy:genDustBG',
    layout: pipelines.dust.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: ubo } },
      { binding: 1, resource: { buffer: dustBuf } },
    ],
  });
  const dustPass = encoder.beginComputePass({ label: 'galaxy:genDustPass' });
  dustPass.setPipeline(pipelines.dust);
  dustPass.setBindGroup(0, dustBindGroup);
  dustPass.dispatchWorkgroups(dispatchCount(dustLayout.capacity));
  dustPass.end();
}
