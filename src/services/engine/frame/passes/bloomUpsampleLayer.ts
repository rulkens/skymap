/**
 * bloomUpsampleLayers — the ascending half of the bloom pyramid as FOUR content
 * layers (`bloom-up-3` .. `bloom-up-0`), one per fold-up step, in coarse→fine
 * order.
 *
 * Each layer reads the COARSER level (`bloom[level+1]`) and ADDITIVELY folds its
 * tent-filtered blur onto the bound `bloom[level]` target. The accumulation of
 * every level's progressively-wider tent is what gives bloom its soft
 * multi-scale falloff. The additive blend lives in the upsample PIPELINE (see
 * `bloomPyramid`); this layer just records the draw.
 *
 * Ordered 3 → 0 so each finer level already carries the sum of all coarser
 * levels folded above it before the next fold-up reads it (`bloom4` into
 * `bloom3`, then that sum into `bloom2`, …, ending at `bloom0`, which
 * `bloomFoldLayer` then blits into HDR).
 *
 * Same one-factory-emits-the-array right-sizing, screen-space `SlabView`
 * handling, and handle-ready enable gate as `bloomDownsampleLayer` — see that
 * module's header. `srcTexelSize` is derived live from the source row's `scale`
 * (`bloomSrcTexelSize`), never hard-coded.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { BLOOM } from '../slabs';
import { bloomSrcTexelSize } from './bloomSrcTexelSize';

export const bloomUpsampleLayers: readonly ContentLayer[] = [3, 2, 1, 0].map(
  (level): ContentLayer => ({
    name: `bloom-up-${level}`,
    slab: BLOOM,
    target: `bloom${level}`,
    // ADDITIVE — each fold accumulates onto the finer level. See header.
    blend: 'additive',

    enabled(state) {
      return state.gpu.bloomPyramid !== null;
    },

    draw(pass, view, ctx, state) {
      if (state.gpu.bloomPyramid === null) return;
      const srcId = `bloom${level + 1}`;
      state.gpu.bloomPyramid.upsample(
        pass,
        ctx.renderTargets.viewOf(srcId),
        level,
        bloomSrcTexelSize(ctx, view, srcId),
      );
    },
  }),
);
