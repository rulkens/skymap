/**
 * encodeGeneration — records the compute dispatches for one galaxy's
 * star and dust generation passes onto an existing `GPUCommandEncoder`.
 *
 * Bind groups are built HERE, at the two compute pipelines, rather than once
 * up front and reused: `layout: 'auto'` (`createGenerationPipelines.ts`)
 * derives a bind-group layout that is specific to the pipeline it came from,
 * even when — as here — the star and dust shaders declare byte-identical
 * `@group(0)` bindings (`milkyWay/sprites/generate.wesl`'s `gen` uniform and `outBuf`
 * storage array). A bind group made against one pipeline's derived layout is
 * not valid on the other, so each pass needs its own, built against its own
 * pipeline's `getBindGroupLayout(0)` — the same rule `createGalaxyEngine.ts`
 * already follows for the star/dust RENDER pipelines sharing the camera
 * buffer (`camBG` vs `camBGdust`).
 *
 * Both shaders use `@workgroup_size(256)`, so the dispatch count is the
 * capacity rounded up to the next multiple of 256 — any thread past
 * `gen.starCapacity`/`gen.dustCapacity` returns immediately (see the shaders'
 * own bounds check) rather than writing out of range.
 *
 * The dust pass is skipped entirely when `dustLayout.capacity === 0`: a
 * galaxy category ineligible for dust (see `carveDustLayout`'s elliptical
 * gate) carves an empty layout, and there is no buffer to bind or work to
 * dispatch — recording a zero-workgroup pass would be a no-op that still
 * costs a bind-group allocation and a pass begin/end pair for nothing.
 */
import type { GenerationPipelines } from '../../../../@types/galaxy/GenerationPipelines';
import type { GenerationLayout } from '../../../../@types/galaxy/GenerationLayout';

/** Matches `@workgroup_size(256)` in both `generateStars.wesl` and `generateDust.wesl`. */
const WORKGROUP_SIZE = 256;

function dispatchCount(capacity: number): number {
  return Math.ceil(capacity / WORKGROUP_SIZE);
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
