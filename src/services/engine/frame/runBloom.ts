/**
 * runBloom — the bloom sub-pipeline as ONE strictly ordered pass sequence (spec
 * §6 of docs/superpowers/specs/2026-11-13-film-look-design.md). The pyramid
 * REUSES targets (`bloom0`..`bloom3` each host a producer and an additive fold),
 * which the generic frame executor cannot express: it would fire an upsample at
 * its target's downsample step and read a coarser level before this frame's
 * clear, ramping the frame toward white. So every pass here reads a level
 * written EARLIER in this sequence, and runBloom owns its own clears.
 * One `'bloom'` timing slot spans it: begin on the bright pass, end on the
 * bloom fold, which is therefore always the last pass.
 */

import type { GpuTimingService } from '../../../@types/gpu/timing/GpuTimingService';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Vec2 } from '../../../@types/math/Vec2';
import { BLOOM_LEVELS, STREAK_FALLOFF_TEXELS, STREAK_STRIDES } from '../../../data/bloomConstants';
import { DEFAULT_BLOOM_CAP } from '../../../data/defaults';
import { bloomSrcTexelSize } from './passes/bloomSrcTexelSize';
import { clearValueOf } from '../../../utils/gpu/clearValueOf';
import { filmStreakOn } from '../../../utils/film/filmStreakOn';
import { filmVeilOn } from '../../../utils/film/filmVeilOn';

/** A `'clear'` pass takes the target's clear value off its spec row (`specOf` throws on a missing one). */
function openBloomPass(
  encoder: GPUCommandEncoder,
  ctx: FrameView,
  state: EngineState,
  target: string,
  loadOp: 'clear' | 'load',
  timestampWrites?: GPURenderPassTimestampWrites,
): GPURenderPassEncoder {
  const view = ctx.snapshot.renderTargets.viewOf(target);
  const colorAttachment: GPURenderPassColorAttachment =
    loadOp === 'clear'
      ? {
          view,
          loadOp: 'clear',
          clearValue: clearValueOf(ctx.snapshot.renderTargets.specOf(target), state),
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
  ctx: FrameView,
  state: EngineState,
  timing: GpuTimingService,
): void {
  // `settings.bloom.enabled` already gated this step out of the program; this
  // only guards a pre-bootstrap or torn-down pyramid.
  const pyramid = state.gpu.bloomPyramid;
  if (pyramid === null) return;

  const { threshold, strength } = state.settings.bloom;
  const film = state.settings.film;
  const { glow } = film;
  const cap = film.enabled ? glow.cap : DEFAULT_BLOOM_CAP;
  const squeeze = film.enabled ? film.grade.squeeze : 1;
  const viewOf = (id: string): GPUTextureView => ctx.snapshot.renderTargets.viewOf(id);
  const squeezedTexel = (src: string): Vec2 => {
    const [x, y] = bloomSrcTexelSize(ctx, src);
    return [x * squeeze, y];
  };

  const ts = timing.descriptorFor('bloom');
  const beginWrites = ts
    ? { querySet: ts.querySet, beginningOfPassWriteIndex: ts.beginningOfPassWriteIndex }
    : undefined;
  const endWrites = ts
    ? { querySet: ts.querySet, endOfPassWriteIndex: ts.endOfPassWriteIndex }
    : undefined;

  const brightPass = openBloomPass(encoder, ctx, state, 'bloom0', 'clear', beginWrites);
  pyramid.bright(brightPass, viewOf('hdr'), { threshold, cap, capFloor: DEFAULT_BLOOM_CAP });
  brightPass.end();

  // Karis only on level 1, the read off the raw bloom0 where fireflies live.
  for (let level = 1; level < BLOOM_LEVELS; level++) {
    const src = `bloom${level - 1}`;
    const pass = openBloomPass(encoder, ctx, state, `bloom${level}`, 'clear');
    pyramid.downsample(pass, viewOf(src), level, squeezedTexel(src), level === 1);
    pass.end();
  }

  // Streak reads bloom1 before the upsample folds land on it: the Karis
  // downsample alone, quarter-res like the streak targets (spec D9). It then
  // ping-pongs bloom1 → streak0 → streak1 → streak0.
  const streakOn = filmStreakOn(film);
  if (streakOn) {
    for (const iteration of [0, 1, 2] as const) {
      const src = iteration === 0 ? 'bloom1' : `streak${iteration - 1}`;
      const pass = openBloomPass(encoder, ctx, state, `streak${iteration % 2}`, 'clear');
      pyramid.streak(pass, viewOf(src), iteration, {
        texel: bloomSrcTexelSize(ctx, src)[0],
        stride: STREAK_STRIDES[iteration],
        threshold: iteration === 0 ? glow.streakThreshold : 0,
        falloff: glow.streakLength * STREAK_FALLOFF_TEXELS,
        tint: glow.streakTint,
      });
      pass.end();
    }
  }

  for (let level = BLOOM_LEVELS - 2; level >= 0; level--) {
    const src = `bloom${level + 1}`;
    const pass = openBloomPass(encoder, ctx, state, `bloom${level}`, 'load');
    pyramid.upsample(pass, viewOf(src), level, squeezedTexel(src));
    pass.end();
  }

  if (filmVeilOn(film)) {
    const blurX = openBloomPass(encoder, ctx, state, 'veil0', 'clear');
    pyramid.veil(blurX, viewOf('bloom4'), 'x', bloomSrcTexelSize(ctx, 'bloom4'));
    blurX.end();
    const blurY = openBloomPass(encoder, ctx, state, 'veil1', 'clear');
    pyramid.veil(blurY, viewOf('veil0'), 'y', bloomSrcTexelSize(ctx, 'veil0'));
    blurY.end();
    const veilFold = openBloomPass(encoder, ctx, state, 'hdr', 'load');
    pyramid.fold(veilFold, viewOf('veil1'), 'veil', glow.veil);
    veilFold.end();
  }

  if (streakOn) {
    const streakFold = openBloomPass(encoder, ctx, state, 'hdr', 'load');
    pyramid.fold(streakFold, viewOf('streak0'), 'streak', glow.streakStrength);
    streakFold.end();
  }

  // hdr already holds the composited scene: the program places this step after
  // the foreground:0 → hdr composite.
  const foldPass = openBloomPass(encoder, ctx, state, 'hdr', 'load', endWrites);
  pyramid.fold(foldPass, viewOf('bloom0'), 'bloom', strength);
  foldPass.end();
}
