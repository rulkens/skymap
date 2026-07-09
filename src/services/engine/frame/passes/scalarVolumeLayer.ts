/**
 * scalarVolumeLayer — the half-resolution scalar-volume raymarch, as a
 * ContentLayer that draws into the volume offscreen target.
 *
 * Replaces the free-standing `encodeVolumes` pre-pass: the raymarch is now a
 * `render` step over the `(target: 'volume', slab: COSMO)` group. The executor
 * owns the pass and the additive-identity `(0, 0, 0, 0)` clear (alpha=0 so the
 * upsample's additive blend adds nothing for any fragment the volumes didn't
 * reach); this layer only issues the draw. The `volume-upsample` HDR layer then
 * bilinearly composites the offscreen into HDR — both layers gate on the same
 * `deriveVolumeLiveness`, so producer and consumer of the volume target can
 * never disagree.
 *
 * ### Why the downscaled viewport (not the canvas viewport)
 *
 * `volumeFieldRenderer.draw` takes `viewportPx` to normalise its per-fragment
 * jitter-dither spatial frequency. The volume offscreen is `1 /
 * VOLUME_RENDER_SCALE_DIVISOR` of the canvas, so passing the canvas size would
 * shift the dither frequency and make it appear finer on the upsampled output.
 * We compute the downscaled size inline (min 1 px for tiny canvases) so the
 * "viewport == offscreen texture size" invariant is obvious at the draw site.
 *
 * ### Why `deriveVolumeLiveness` is re-derived in `draw`
 *
 * `enabled` already proved liveness is non-null, but a layer holds no state
 * across calls and re-deriving is a cheap pure projection — the closures it
 * yields (`settingsOf` clamped, `fadeOpacityOf` recessed-master-multiplied) are
 * exactly what the raymarch reads per field. The defensive early-return on a
 * null result mirrors every sibling layer's null-guard: a future gate reordering
 * can't make this draw read a stale offscreen.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { deriveVolumeLiveness } from '../volumeLiveness';
import { VOLUME_RENDER_SCALE_DIVISOR } from '../../../gpu/passes/volumeOffscreen';

export const scalarVolumeLayer: ContentLayer = {
  name: 'scalar-volume',
  slab: COSMO,
  target: 'volume',
  blend: 'additive',

  enabled(state, ctx) {
    return deriveVolumeLiveness(state, ctx) !== null;
  },

  draw(pass, view, ctx, state) {
    // Defensive: the executor only calls draw when enabled() returned true, but
    // re-deriving keeps this a pure function of (state, ctx) with no reliance on
    // gate ordering. A null result (or missing renderer) draws nothing.
    const liveness = deriveVolumeLiveness(state, ctx);
    if (liveness === null) return;
    const renderer = state.gpu.volumeFieldRenderer;
    if (renderer === null) return;

    // Viewport matches the volume offscreen's texture size (canvas /
    // VOLUME_RENDER_SCALE_DIVISOR); min 1 px guards small canvases.
    const vw = Math.max(1, Math.floor(ctx.canvasSize.width / VOLUME_RENDER_SCALE_DIVISOR));
    const vh = Math.max(1, Math.floor(ctx.canvasSize.height / VOLUME_RENDER_SCALE_DIVISOR));
    renderer.draw(
      pass,
      view.vp,
      [vw, vh],
      view.camPos,
      liveness.settingsOf,
      liveness.fadeOpacityOf,
    );
  },
};
