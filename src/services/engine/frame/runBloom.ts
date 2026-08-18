/**
 * runBloom — the screen-space bloom sub-pipeline as ONE strictly-ordered
 * sequence of GPU passes, driven by the `{ kind: 'bloom' }` frame step.
 *
 * ### The strict pass order IS the fix
 *
 * Bloom is a ping-pong mip pyramid: bright prefilter (hdr → bloom0), a
 * DESCENDING downsample chain (bloom0 → bloom4), an ASCENDING additive upsample
 * fold (bloom4 → bloom0), and a strength-scaled fold back into HDR. Every pass
 * reads a level written EARLIER in this same sequence — `hdr` for the bright
 * prefilter, `bloom[n-1]` for downsample n, `bloom[n+1]` for upsample n,
 * `bloom0` for the fold — so no pass ever samples an uncleared or stale level.
 *
 * That is exactly what the previous ten-`ContentLayer` wiring got wrong. The
 * frame executor fires every layer whose `(target, slab)` matches a render
 * step, with no already-drawn exclusion, and the pyramid REUSES targets
 * (`bloom0` and `bloom3` each host a downsample AND an upsample). So each
 * upsample layer fired PREMATURELY at its target's downsample step and read the
 * coarser level before that level's first-touch clear happened this frame,
 * pulling in last frame's stored contents. That cross-frame feedback ramped
 * brightness every frame until it saturated the whole screen to white. Modeling
 * bloom as one sequential pipeline removes the reuse hazard: the passes run in
 * fixed order, and `runBloom` owns its own clears rather than leaning on the
 * executor's per-target first-touch bookkeeping (which tracks scene targets).
 *
 * ### One timing slot spanning the whole sub-routine
 *
 * A single `'bloom'` GPU-timing slot brackets the sequence: the begin timestamp
 * rides the bright pass, the end timestamp rides the fold pass, both writing the
 * one shared query pair. The decoder reads two absolute tick values at fixed
 * indices and subtracts, so splitting begin and end across different passes of
 * the same querySet yields the honest cross-pass span (verified against
 * `gpuTimingService` / `decodeTimestampBuffer`, which make no same-pass
 * assumption).
 */

import type { GpuTimingService } from '../../../@types/gpu/timing/GpuTimingService';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Vec2 } from '../../../@types/math/Vec2';
import { BLOOM_LEVELS } from '../../../data/bloomConstants';
import { bloomSrcTexelSize } from './passes/bloomSrcTexelSize';

/**
 * Open one bloom pass against `target`'s view. A `'clear'` pass reads the
 * target's clear value off its spec row (the bright + downsample producers
 * own their level); a `'load'` pass keeps what the sequence already wrote
 * (the additive upsample folds and the fold into HDR). `timestampWrites`
 * carries the bloom slot's begin (on the first pass) or end (on the last).
 * `specOf` throwing on a missing row (rather than the old table lookup's
 * silent `{0,0,0,0}` fallback under `noUncheckedIndexedAccess`) is this rung's
 * one sanctioned behaviour change.
 */
function openBloomPass(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  view: GPUTextureView,
  target: string,
  loadOp: 'clear' | 'load',
  timestampWrites: GPURenderPassTimestampWrites | undefined,
): GPURenderPassEncoder {
  const colorAttachment: GPURenderPassColorAttachment =
    loadOp === 'clear'
      ? {
          view,
          loadOp: 'clear',
          clearValue: ctx.renderTargets.specOf(target).clearValue,
          storeOp: 'store',
        }
      : { view, loadOp: 'load', storeOp: 'store' };
  return encoder.beginRenderPass({
    label: `bloom-${target}`,
    colorAttachments: [colorAttachment],
    ...(timestampWrites ? { timestampWrites } : {}),
  });
}

export function runBloom(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
  timing: GpuTimingService,
): void {
  // Handle-ready gate: the `settings.bloom.enabled` master toggle already gated
  // this step out of the program at build time, so this only guards a
  // pre-bootstrap or torn-down pyramid — mirroring the old per-layer null check.
  const pyramid = state.gpu.bloomPyramid;
  if (pyramid === null) return;

  const { threshold, strength } = state.settings.bloom;
  const viewportPx: Vec2 = [ctx.canvasSize.width, ctx.canvasSize.height];
  const viewOf = (id: string): GPUTextureView => ctx.renderTargets.viewOf(id);

  // One `'bloom'` slot spanning the sub-routine: begin on the bright pass, end
  // on the fold pass, sharing the one query pair. A no-op timing service returns
  // undefined, so both spreads collapse to nothing in production frames.
  const ts = timing.descriptorFor('bloom');
  const beginWrites: GPURenderPassTimestampWrites | undefined = ts
    ? { querySet: ts.querySet, beginningOfPassWriteIndex: ts.beginningOfPassWriteIndex }
    : undefined;
  const endWrites: GPURenderPassTimestampWrites | undefined = ts
    ? { querySet: ts.querySet, endOfPassWriteIndex: ts.endOfPassWriteIndex }
    : undefined;

  // Bright prefilter: hdr → bloom0, clearing bloom0. Carries the slot's begin.
  const brightPass = openBloomPass(encoder, ctx, viewOf('bloom0'), 'bloom0', 'clear', beginWrites);
  pyramid.bright(brightPass, viewOf('hdr'), threshold);
  brightPass.end();

  // Descending downsample chain: bloom[level-1] → bloom[level], clearing each
  // level (the downsample is its target's sole producer). Karis only on level 1,
  // the read off the raw bloom0 where fireflies live. Levels 1..BLOOM_LEVELS-1 —
  // for BLOOM_LEVELS=5 this is exactly [1, 2, 3, 4].
  const downsampleLevels = Array.from({ length: BLOOM_LEVELS - 1 }, (_unused, i) => i + 1);
  for (const level of downsampleLevels) {
    const src = `bloom${level - 1}`;
    const target = `bloom${level}`;
    const pass = openBloomPass(encoder, ctx, viewOf(target), target, 'clear', undefined);
    pyramid.downsample(
      pass,
      viewOf(src),
      level,
      bloomSrcTexelSize(ctx, viewportPx, src),
      level === 1,
    );
    pass.end();
  }

  // Ascending additive fold: bloom[level+1] → bloom[level], LOADING each level
  // (the downsample/bright already wrote it this sequence, so the additive
  // upsample accumulates onto it). Levels BLOOM_LEVELS-2..0 (mirror of the
  // downsample range) — for BLOOM_LEVELS=5 this is exactly [3, 2, 1, 0].
  const upsampleLevels = Array.from(
    { length: BLOOM_LEVELS - 1 },
    (_unused, i) => BLOOM_LEVELS - 2 - i,
  );
  for (const level of upsampleLevels) {
    const src = `bloom${level + 1}`;
    const target = `bloom${level}`;
    const pass = openBloomPass(encoder, ctx, viewOf(target), target, 'load', undefined);
    pyramid.upsample(pass, viewOf(src), level, bloomSrcTexelSize(ctx, viewportPx, src));
    pass.end();
  }

  // Fold: bloom0 → hdr, LOADING hdr (it already holds the composited scene — the
  // program places the bloom step after the foreground:0→hdr composite). Carries
  // the slot's end.
  const foldPass = openBloomPass(encoder, ctx, viewOf('hdr'), 'hdr', 'load', endWrites);
  pyramid.fold(foldPass, viewOf('bloom0'), strength);
  foldPass.end();
}
