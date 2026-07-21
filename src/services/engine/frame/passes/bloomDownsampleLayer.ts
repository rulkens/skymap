/**
 * bloomDownsampleLayers — the descending half of the bloom pyramid as FOUR
 * content layers (`bloom-down-1` .. `bloom-down-4`), one per pyramid step.
 *
 * Each layer reads the next-finer level (`bloom[level-1]`) and writes the bound
 * `bloom[level]` target, halving resolution while blurring — four times, so the
 * mip chain builds from `bloom0` down to `bloom4`. The write OVERWRITES (opaque):
 * each level has a single producer, nothing to accumulate against.
 *
 * ### Why one parameterised factory, not four near-duplicate files
 *
 * The four layers differ only in their level index (and thus source id, target
 * id, and the level-1-only Karis flag). Writing four byte-identical-but-for-a-
 * number modules would be four chances to drift the source/target pairing.
 * A single `.map` over `[1, 2, 3, 4]` emits the array; the registry spreads it
 * into `CONTENT_LAYERS`. This is the plan's right-sizing directive — one
 * exported factory array, not one-symbol-per-file split (that rule is a `utils/`
 * / `@types/` rule; a layer group is one domain's registry contribution).
 *
 * `karis` (the firefly-suppressing Karis average) is true ONLY for level 1 —
 * the read off the raw `bloom0` where fireflies live; deeper levels are already
 * smoothed. `srcTexelSize` is derived live from the source row's `scale` (see
 * `bloomSrcTexelSize`), never hard-coded.
 *
 * The enable gate and the screen-space `SlabView` handling mirror
 * `bloomBrightLayer` — see that module's header.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { BLOOM } from '../slabs';
import { bloomSrcTexelSize } from './bloomSrcTexelSize';

export const bloomDownsampleLayers: readonly ContentLayer[] = [1, 2, 3, 4].map(
  (level): ContentLayer => ({
    name: `bloom-down-${level}`,
    slab: BLOOM,
    target: `bloom${level}`,
    // OVERWRITE — the downsample is the sole producer of its target. See header.
    blend: 'opaque',

    enabled(state) {
      return state.gpu.bloomPyramid !== null;
    },

    draw(pass, view, ctx, state) {
      if (state.gpu.bloomPyramid === null) return;
      const srcId = `bloom${level - 1}`;
      state.gpu.bloomPyramid.downsample(
        pass,
        ctx.renderTargets.viewOf(srcId),
        level,
        bloomSrcTexelSize(ctx, view, srcId),
        level === 1,
      );
    },
  }),
);
