/**
 * bloomFoldLayer — the final composite of the bloom pyramid: reads `bloom0` (the
 * accumulated finest level, after every coarser tent has folded down into it)
 * and ADDITIVELY blits it into the HDR target, scaled by the user's bloom
 * strength.
 *
 * This is the tenth and last bloom content layer. It targets `hdr` (not a
 * `bloom*` row), so it rejoins the scene the bright pass originally sampled —
 * the glow lands back on top of the galaxies and the Sun's disc before tone-map.
 *
 * ### Why a `fold` method, not the generic compositor
 *
 * `strength` (`state.settings.bloom.strength`) is a per-draw multiply, and the
 * shared compositor bakes its blend/format table at construction with no
 * per-draw scalar slot. Rather than a sibling one-off pass, the strength multiply
 * lives in `bloomPyramid.fold(pass, bloom0View, strength)` — keeping all four
 * bloom pipelines (bright / downsample / upsample / fold) in the one factory.
 * The fold draws once per frame, so its uniform is a single buffer with no
 * writeBuffer/submit race (unlike the per-level downsample/upsample buffers).
 *
 * Screen-space `SlabView` handling (ignored) and the handle-ready enable gate
 * mirror `bloomBrightLayer` — see that module's header. `strength` is read LIVE
 * each draw so the slider takes effect the next frame with no rebuild.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { BLOOM } from '../slabs';

export const bloomFoldLayer: ContentLayer = {
  name: 'bloom-fold',
  slab: BLOOM,
  target: 'hdr',
  blend: 'additive',

  enabled(state) {
    return state.gpu.bloomPyramid !== null;
  },

  draw(pass, _view, ctx, state) {
    if (state.gpu.bloomPyramid === null) return;
    state.gpu.bloomPyramid.fold(
      pass,
      ctx.renderTargets.viewOf('bloom0'),
      state.settings.bloom.strength,
    );
  },
};
