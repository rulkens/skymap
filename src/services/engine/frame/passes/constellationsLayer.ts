/**
 * constellationsLayer — the true-3D constellation stick-figure overlay.
 *
 * ### What it draws
 *
 * The 88 classical asterisms as additive line segments between the real stars
 * that form them (from the demand-loaded `constellations.json`). Each endpoint
 * sits at its member star's heliocentric position, so from Earth's vantage the
 * familiar figures appear, and flying away shears them apart — "a constellation
 * is a coincidence of sightlines" made visible by flight alone.
 *
 * ### The odd row out: `hdr` target, NEAR0 slab (same seam as the star layers)
 *
 * The figures live at parsec-to-kiloparsec scale, which COSMO's fixed near
 * plane (0.01 Mpc) would clip, so this row projects through NEAR0 — whose
 * near/far track the camera's orbit distance — while still accumulating into
 * the HDR target so the lines ride the same tone-map as the stars they connect.
 * It joins the existing `(hdr, NEAR0)` render step the star layers already use.
 * Additive blending makes per-fragment colour order-independent, so its
 * placement among the additive NEAR0 rows is an encoder-record listing choice,
 * not a compositing one (see `filamentsLayer` for the same rationale).
 *
 * ### Precision — a dumb f32 renderer fed the plain NEAR0 vp
 *
 * The renderer uploads the artifact's endpoints ONCE, scaled parsecs → world
 * Mpc (the segment set is static, tier-agnostic data — there is no per-frame
 * rebuild). Those uploaded positions are ABSOLUTE heliocentric Mpc, and NEAR0's
 * `view.vp` is an origin-relative projection built around `RENDER_ORIGIN_MPC`
 * ([0,0,0], the heliocentric origin), so `view.vp · vec4(pos, 1)` projects them
 * correctly. Deliberately NOT the `rebaseViewProj(view.slab.vp, camPos)` seam
 * `starPointsLayer` / `starCatalogLayer` use: that rebase folds the eye offset
 * into the matrix and REQUIRES camera-relative position inputs (`pos − camPos`),
 * which a once-uploaded absolute buffer does not provide — feeding it absolute
 * positions would translate every figure by `camPos`. The trade-off is the
 * close-approach f32 jitter the rebase exists to remove: within ~AU of a
 * constellation endpoint star the projected line can quantise slightly. That is
 * acceptable for an annotation overlay that is degenerate at that zoom and fades
 * out well before it (the distance band below). If close-approach precision is
 * ever needed, the fix is to re-express endpoints camera-relative per frame in
 * f64 and pass the rebased vp — the `starPointsLayer` pattern, at the cost of a
 * cheap per-frame re-upload of ~700 segments.
 *
 * ### Upload is lazy, off the slot (no commit)
 *
 * The `constellations` slot carries the artifact as CPU-resident data with no
 * commit step, so this pass performs the one-time GPU upload itself the first
 * ready frame: `renderer.upload(artifact)` runs once, guarded by
 * `renderer.hasData()`.
 *
 * ### When it draws (house rule: gate at `enabled`, opacity 0 ⇒ no render)
 *
 * `enabled` gates on the layer's master toggle (`settings.constellations.enabled`)
 * AND the distance band being non-zero. Keyed on the camera's distance from the
 * heliocentric origin, the band (`SCALE_FADE_BANDS.constellations`) recedes the
 * figures as the camera pulls out of the neighbourhood; once it reads 0 the layer
 * DISABLES outright rather than draw invisible lines — the same "opacity 0 ⇒ no
 * render" discipline `starPointsLayer` follows. `enabled` reads the absolute
 * camera (`ctx.drawCamPos`) while `draw` reads NEAR0's origin-relative
 * `view.camPos`; the two coincide because `RENDER_ORIGIN_MPC` is [0,0,0].
 *
 * The smooth ENABLE/DISABLE toggle fade (the FadeRegistry `{ kind:
 * 'constellations' }` controller + its `FADE_LAYERS` row) is a separate wiring
 * task (spec §Runtime → Fades); until it lands the toggle is a hard cut, and the
 * per-frame `fadeOpacity` handed to the renderer is the distance band alone.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';

/**
 * Line half-width in screen-space pixels — a ~1.5-2 px thin steel-blue stroke
 * (spec Q5). Matches `FILAMENT_LINE_HALFWIDTH_PX`; eye-tuning starting point.
 */
const CONSTELLATION_LINE_HALFWIDTH_PX = 0.9;

export const constellationsLayer: ContentLayer = {
  name: 'constellations',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    if (!state.settings.constellations.enabled) return false;
    // Disable once the distance band has receded to 0 (camera far out of the
    // neighbourhood, figures sheared/subpixel) — the "opacity 0 ⇒ no render"
    // house rule, which also empties the (hdr, NEAR0) step for this row. Keyed
    // on the camera's heliocentric-origin distance (drawCamPos is the absolute
    // eye; the origin is [0,0,0]).
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return fadeBand(SCALE_FADE_BANDS.constellations, camDistMpc) > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.constellationRenderer;
    if (renderer === null) return;

    // Lazy one-time upload off the slot's ready artifact (the slot has no commit
    // — see the module header). `hasData()` makes this run exactly once.
    if (!renderer.hasData()) {
      const slot = state.assetSlots.constellations;
      if (slot === null) return;
      const slotState = slot.state();
      if (slotState.kind !== 'ready') return;
      renderer.upload(slotState.value);
      if (!renderer.hasData()) return; // empty artifact — nothing to draw
    }

    // The distance fade for THIS frame, keyed on the camera's heliocentric-origin
    // distance — the same quantity `enabled` gates on, read here from
    // `view.camPos` (the frames coincide; module header). It is the renderer's
    // per-frame opacity.
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    const distanceFade = fadeBand(SCALE_FADE_BANDS.constellations, camDistMpc);

    renderer.draw(
      pass,
      view.vp,
      view.viewportPx,
      CONSTELLATION_LINE_HALFWIDTH_PX,
      state.settings.constellations.intensity,
      distanceFade,
    );
  },
};
