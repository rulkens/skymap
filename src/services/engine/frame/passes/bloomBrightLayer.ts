/**
 * bloomBrightLayer — the bright-prefilter stage of the bloom pyramid: reads the
 * HDR scene and writes the above-threshold light into `bloom0` (the finest
 * pyramid level), OVERWRITING (opaque — it is the sole producer of bloom0).
 *
 * This is the first of the ten bloom content layers. Like `volumeUpsampleLayer`
 * it is a screen-space blit — it ignores the resolved `SlabView` entirely (the
 * bright pass is a fullscreen re-read of an already-rendered offscreen, not a
 * re-projection of world geometry). It carries a `slab` only because a
 * `ContentLayer` is grouped by `(target, slab)`; the dedicated `BLOOM` slab
 * keeps the whole bloom sub-program's groups DISJOINT from the cosmological and
 * near-field ones (see `slabs.ts` — the fold especially must not join the galaxy
 * `(hdr, COSMO)` step). The slab's view-projection never matters; only
 * `view.viewportPx` (full-res, identical across slabs) is read, by the
 * downsample / upsample folds.
 *
 * ### The enable gate is the handle-ready check only
 *
 * `enabled` is exactly `state.gpu.bloomPyramid !== null`. The user-facing
 * `settings.bloom.enabled` master toggle gates at frame-program build — when
 * bloom is off, the program omits every bloom render step, so no bloom layer
 * runs regardless of this gate (the render-wake / opacity-0 convention: gate at
 * program assembly, not inside the draw). Keeping the layer gate to the handle
 * check means a pre-bootstrap or torn-down pyramid silently no-ops.
 *
 * `threshold` is read LIVE from `state.settings.bloom.threshold` each draw, so
 * the slider takes effect the next frame with no rebuild.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { BLOOM } from '../slabs';

export const bloomBrightLayer: ContentLayer = {
  name: 'bloom-bright',
  slab: BLOOM,
  target: 'bloom0',
  blend: 'opaque',

  enabled(state) {
    return state.gpu.bloomPyramid !== null;
  },

  draw(pass, _view, ctx, state) {
    // Defensive null-check mirroring volumeUpsampleLayer: the `enabled` gate
    // already proved the handle is non-null, but re-checking here keeps a future
    // gate reordering from skipping the guard.
    if (state.gpu.bloomPyramid === null) return;
    state.gpu.bloomPyramid.bright(
      pass,
      ctx.renderTargets.viewOf('hdr'),
      state.settings.bloom.threshold,
    );
  },
};
