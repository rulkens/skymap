/**
 * encodeBloomPyramid — a deliberate duplicate of the runtime's `runBloom` pass
 * sequence, calling the SAME shared `bloomPyramid`. Only the orchestration is
 * copied: `runBloom` reads its targets off a `ReadyFrameContext` and brackets
 * the sequence in a GPU-timing slot, neither of which exists in this tool.
 *
 * The pass ORDER is load-bearing and must stay in step with `runBloom`: every
 * pass reads a level written earlier in this same sequence, which is what keeps
 * a level from ever sampling last frame's stored contents — the cross-frame
 * feedback that ramps the whole screen to white.
 *
 *   bright        hdr      -> bloom0          (clear)
 *   downsample L  bloomL-1 -> bloomL          (clear), Karis on L=1 only
 *   upsample   L  bloomL+1 -> bloomL          (load, additive)
 *   fold          bloom0   -> hdr             (load, additive, x strength)
 *
 * The fold puts the glow back into the HDR scene BEFORE the tone curve, so
 * bloom rides that one curve rather than needing a second texture bind and
 * a strength knob the shared compositor has no slot for.
 */
import type { BloomPyramid } from '../../../../../src/@types/rendering/BloomPyramid';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import { BLOOM_LEVELS } from '../../../../../src/data/bloomConstants';

export function encodeBloomPyramid(
  enc: GPUCommandEncoder,
  deps: {
    readonly pyramid: BloomPyramid;
    readonly hdrView: GPUTextureView;
    /** Re-read per call: a resize reallocates these, so a captured snapshot goes stale. */
    readonly mips: readonly GPUTexture[];
    readonly texelSize: (level: number) => Vec2;
    readonly threshold: number;
    readonly strength: number;
    /** One span across the pyramid: begin rides the bright pass, end rides the fold. */
    readonly timestamps?: GPURenderPassTimestampWrites;
  },
): void {
  const { pyramid, hdrView, mips, texelSize, threshold, strength, timestamps } = deps;

  const clear = { r: 0, g: 0, b: 0, a: 0 };
  const open = (
    level: number,
    loadOp: 'clear' | 'load',
    timestampWrites?: GPURenderPassTimestampWrites,
  ): GPURenderPassEncoder =>
    enc.beginRenderPass({
      label: `galaxy:bloom${level}`,
      colorAttachments: [
        loadOp === 'clear'
          ? { view: mips[level]!.createView(), loadOp, storeOp: 'store', clearValue: clear }
          : { view: mips[level]!.createView(), loadOp, storeOp: 'store' },
      ],
      ...(timestampWrites ? { timestampWrites } : {}),
    });

  // Both halves of ONE query pair, split across two passes — the app's billing.
  // The decoder reads two absolute tick values at fixed indices and subtracts,
  // so splitting the pair this way yields the honest cross-pass span.
  const beginWrites = timestamps
    ? {
        querySet: timestamps.querySet,
        beginningOfPassWriteIndex: timestamps.beginningOfPassWriteIndex,
      }
    : undefined;
  const endWrites = timestamps
    ? { querySet: timestamps.querySet, endOfPassWriteIndex: timestamps.endOfPassWriteIndex }
    : undefined;

  const brightPass = open(0, 'clear', beginWrites);
  pyramid.bright(brightPass, hdrView, threshold);
  brightPass.end();

  for (let level = 1; level < BLOOM_LEVELS; level++) {
    const pass = open(level, 'clear');
    pyramid.downsample(
      pass,
      mips[level - 1]!.createView(),
      level,
      texelSize(level - 1),
      level === 1,
    );
    pass.end();
  }

  for (let level = BLOOM_LEVELS - 2; level >= 0; level--) {
    const pass = open(level, 'load');
    pyramid.upsample(pass, mips[level + 1]!.createView(), level, texelSize(level + 1));
    pass.end();
  }

  const foldPass = enc.beginRenderPass({
    label: 'galaxy:bloomFold',
    colorAttachments: [{ view: hdrView, loadOp: 'load', storeOp: 'store' }],
    ...(endWrites ? { timestampWrites: endWrites } : {}),
  });
  pyramid.fold(foldPass, mips[0]!.createView(), strength);
  foldPass.end();
}
