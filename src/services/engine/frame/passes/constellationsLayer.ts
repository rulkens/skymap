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
 * ### Precision — the `starPointsLayer` f64 rebase seam
 *
 * The endpoints live at parsec-to-kiloparsec coordinates (~1.3×10⁻⁶ Mpc),
 * and on the final approach to a figure's member star the NEAR0 vp's view
 * translation is a similarly-sized number. Multiplying an absolute endpoint by
 * the plain (f32-narrowed) `view.vp` subtracts two large-ish numbers in the
 * shader to recover a tiny camera-relative position — catastrophic cancellation
 * that quantises the projected line onto a coarse grid and makes it hop as the
 * camera closes. The fix mirrors `starPointsLayer` exactly: each frame we fold
 * the eye offset into the vp in f64 (`rebaseViewProj(view.slab.vp, camPos)`,
 * narrowed at the upload boundary) and hand the renderer `camPos`, which
 * re-expresses every endpoint camera-relative in the per-frame instance write.
 * Neither operand the f32 shader multiplies then carries a large-number hazard,
 * and the shader + instance layout are untouched — only what this layer HANDS
 * the renderer changes. `view.camPos` is NEAR0's origin-relative eye, the same
 * frame the slab vp and the endpoints are built in, so it zeroes the view
 * translation the rebase folds out.
 *
 * ### Upload happens once, in the slot commit (not here)
 *
 * The `constellations` slot's commit uploads the artifact to the renderer the
 * moment it lands (and kicks the demand-loaded fade) — see `constellationsSlot`.
 * So this pass never uploads; it only draws once `renderer.hasData()` is true.
 *
 * ### When it draws (house rule: gate at `enabled`, opacity 0 ⇒ no render)
 *
 * The distance band (`SCALE_FADE_BANDS.constellations`), keyed on the camera's
 * distance from the heliocentric origin, is a HARD cull: once it reads 0 (camera
 * far out of the neighbourhood, figures sheared/subpixel) `enabled` returns false
 * regardless of the toggle — the "opacity 0 ⇒ no render" discipline
 * `starPointsLayer` follows, which also empties the (hdr, NEAR0) step for this row.
 *
 * Inside the band, the master toggle drives a smooth ENABLE/DISABLE fade via the
 * FadeRegistry `{ kind: 'constellations' }` controller (seeded by its
 * `FADE_LAYERS` row, ramped by the `watchFadesSaga` FADE_ROW entry on
 * `setConstellationsEnabled` — and first kicked to the on-intent by the slot
 * commit). So `enabled` renders while the setting is on OR the disable fade-out
 * tail is still above 0 — the same pattern `filamentsLayer` uses — and `draw`
 * hands the renderer the distance band TIMES that fade opacity so the figures
 * dissolve smoothly on toggle rather than hard-cutting. Both the band and the
 * product come from `constellationLayerOpacity`, the one home the label producer
 * shares, so the names dissolve in lock-step with the lines. `enabled` reads the
 * absolute camera (`ctx.drawCamPos`) while `draw` reads NEAR0's origin-relative
 * `view.camPos`; the two carry the same value because `slabViewOf` copies
 * `drawCamPos` verbatim into `view.camPos`.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { constellationLayerOpacity } from '../../presentation/constellationLayerOpacity';
import { resolveLayerOpacity } from '../../presentation/focusRecession';

/**
 * Line half-width in screen-space pixels — a ~1.5-2 px thin steel-blue stroke
 * (spec Q5). Eye-tuned slightly heavier than the filament lines' 0.9 so the
 * figures read at a glance.
 */
const CONSTELLATION_LINE_HALFWIDTH_PX = 1.3;

/**
 * The single dim steel-blue tone (RGB) every figure emits, additively into the
 * HDR buffer — a cool faint wireflow over the starfield, not a saturated UI
 * stroke (grill Q5: one tone for all 88 figures, no per-constellation hue). This
 * is the one home for the layer's tint; the pass hands it to the renderer, which
 * packs it into the fragment shader's `lineColor` uniform. Eye-tuned in Task 15.
 */
const CONSTELLATION_LINE_COLOR: Vec3 = [0.42, 0.58, 0.9];

export const constellationsLayer: ContentLayer = {
  name: 'constellations',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // Hard distance cull: once the band reads 0 (camera far out of the
    // neighbourhood, figures sheared/subpixel) the layer disables regardless of
    // the toggle — "opacity 0 ⇒ no render", which also empties the (hdr, NEAR0)
    // step for this row. Keyed on the camera's heliocentric-origin distance
    // (drawCamPos is the absolute eye; the origin is [0,0,0]).
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    // Passing opacity 1 reduces the shared product to the raw distance band —
    // the band-only cull, keeping the `fadeBand` lookup in the one home.
    if (constellationLayerOpacity(camDistMpc, 1) === 0) return false;
    // Inside the band: the setting is the user's intent; the fade opacity is the
    // visual state. Render while EITHER is live so the disable fade-out tail
    // keeps drawing until it reaches 0 (mirrors filamentsLayer).
    if (state.settings.constellations.enabled) return true;
    return state.subsystems.fades.opacityOf({ kind: 'constellations' }, ctx.nowMs) > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.constellationRenderer;
    if (renderer === null) return;
    // The slot commit uploads on the first ready frame; nothing to draw until it
    // has run (an empty artifact leaves this false permanently).
    if (!renderer.hasData()) return;

    // The renderer's per-frame opacity: the distance band (keyed on the camera's
    // heliocentric-origin distance, read from `view.camPos` — a verbatim copy of
    // `drawCamPos`, see the module header) TIMES the fade-registry toggle
    // opacity, so the figures dissolve smoothly on ENABLE/DISABLE within the
    // band. The same one home the label producer reads, so names track lines.
    const camPos = view.camPos;
    const camDistMpc = Math.hypot(camPos[0], camPos[1], camPos[2]);
    const toggleFade = resolveLayerOpacity(state, ctx, { kind: 'constellations' });
    const layerOpacity = constellationLayerOpacity(camDistMpc, toggleFade);

    // Fold the eye offset into the vp in f64 so it pairs with the camera-relative
    // endpoints the renderer re-writes per frame — narrowed HERE at the GPU-upload
    // boundary, exactly the `starPointsLayer` seam. Uses the slab's f64 `vp`, NOT
    // the already-narrowed `view.vp`.
    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));

    renderer.draw(
      pass,
      rebasedVp,
      view.viewportPx,
      CONSTELLATION_LINE_HALFWIDTH_PX,
      state.settings.constellations.intensity,
      layerOpacity,
      camPos,
      CONSTELLATION_LINE_COLOR,
    );
  },
};
