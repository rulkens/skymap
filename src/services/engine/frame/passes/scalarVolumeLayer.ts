/**
 * scalarVolumeLayer — the half-resolution scalar-volume raymarch, as a
 * ContentLayer that draws into the volume offscreen target.
 *
 * The raymarch is a `render` step over the `(target: 'volume', slab: COSMO)`
 * group. The executor owns the pass and the additive-identity `(0, 0, 0, 0)`
 * clear (alpha=0 so the upsample's additive blend adds nothing for any
 * fragment the volumes didn't reach); this layer only issues the draw. The
 * `volume-upsample` HDR layer then
 * bilinearly composites the offscreen into HDR — both layers gate on the same
 * `deriveVolumeLiveness`, so producer and consumer of the volume target can
 * never disagree.
 *
 * ### Why the downscaled viewport (not the canvas viewport)
 *
 * `volumeFieldRenderer.draw` takes `viewportPx` to normalise its per-fragment
 * jitter-dither spatial frequency. The volume target is `1 / scale` of the
 * canvas (the `'volume'` row's `scale` in the render-target table), so passing
 * the canvas size would shift the dither frequency and make it appear finer on
 * the upsampled output. We compute the downscaled size inline (min 1 px for
 * tiny canvases, mirroring the table's allocation formula) so the "viewport ==
 * offscreen texture size" invariant is obvious at the draw site.
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

    // Viewport matches the volume target's texture size: same
    // floor(canvas / scale), min 1 px formula `renderTargets` allocates
    // with, reading the SAME `scale` off the 'volume' spec row — so the
    // divisor has one home and viewport == texture by construction.
    const scale = ctx.renderTargets.specs.find((s) => s.id === 'volume')!.scale;
    const vw = Math.max(1, Math.floor(ctx.canvasSize.width / scale));
    const vh = Math.max(1, Math.floor(ctx.canvasSize.height / scale));
    // Tangent of one pixel's half-angle at the volume target, mirroring
    // `drawPxPerRad`'s shape (frameContext.ts:177) but against the
    // downscaled `vh` above rather than the canvas height, and inverted
    // to a per-pixel tangent: half the target's vertical FOV subtends
    // `tan(fovYRad/2)` over `vh/2` pixels, so one pixel's angular width
    // is `2 * tan(fovYRad/2) / vh` — exact, not a small-angle approximation:
    // perspective projection is linear in tan-space, so dividing the full
    // tan(fovYRad/2) span evenly by pixel count gives each pixel's tangent
    // exactly. Task 6's cone-LOD march uses this to grow its sample
    // footprint with distance.
    const pixelConeTan = (2 * Math.tan(ctx.fovYRad / 2)) / vh;
    renderer.draw(
      pass,
      view.vp,
      [vw, vh],
      view.camPos,
      pixelConeTan,
      liveness.settingsOf,
      liveness.fadeOpacityOf,
    );
  },
};
