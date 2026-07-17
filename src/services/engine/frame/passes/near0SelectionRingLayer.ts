/**
 * near0SelectionRingLayer — the selection halo for a picked NEAR0-slab thing
 * (today: a survey star), drawn OVER onto the swap chain post-tone-map.
 *
 * ## Why a NEAR0 sibling to `selectionRingLayer`, and why they partition by slab
 *
 * The COSMO `selectionRingLayer` and this layer feed the SAME
 * `state.gpu.selectionRingRenderer` and read the SAME `selectionHalo` table —
 * the difference is the slab their ring projects through. A picked galaxy sits
 * at Mpc scale and rings cleanly in COSMO, whose fixed 10 kpc near plane a
 * parsec-scale star anchor would fall inside of; a picked star sits at
 * AU-to-parsec scale and rings cleanly in NEAR0, whose adaptive far plane a
 * 100 Mpc galaxy falls outside of.
 *
 * Each layer therefore gates on its OWN slab: this one draws only halos tagged
 * `slab === NEAR0`, the COSMO sibling only `slab === COSMO`. The `selectionHalo`
 * table stamps that affiliation per kind (star → NEAR0; galaxy/Milky-Way →
 * COSMO). That partition is load-bearing, not cosmetic. Both layers share one
 * renderer whose `draw` calls `queue.writeBuffer` on a shared camera + selection
 * uniform buffer, and the whole frame records into ONE command encoder with ONE
 * `queue.submit`. Under WebGPU's queue timeline every `writeBuffer` is applied
 * before the submit runs, so if both layers drew in a frame, BOTH recorded draws
 * would read the LAST-written uniforms — the NEAR0 rebased view-projection —
 * and the COSMO galaxy, now outside NEAR0's far plane, would clip away and its
 * halo vanish. This is the documented "writeBuffer/submit race" landmine. The
 * tempting alternative — gate both layers identically and rely on each
 * wrong-slab draw self-clipping against its frustum — assumes per-draw uniforms;
 * with a shared buffer the last write wins for both draws, so it fails exactly
 * when a galaxy or the Milky Way is selected. Partitioning by slab makes exactly
 * one layer enabled per frame, so exactly one `writeBuffer` lands and the race
 * is gone by construction. A THIRD slab flavour would be the trigger to fold the
 * slab into the table (spec §10 "Adjacent").
 *
 * ## The f64 rebase seam — why `view.slab.vp` + a camera-relative centre
 *
 * A star anchor is a parsec-scale coordinate (~1.3×10⁻⁶ Mpc) and, during the
 * final approach, the NEAR0 vp's view translation is the same tiny magnitude:
 * their f32 subtraction cancels catastrophically, hopping the ring centre by
 * pixels. Like `starPointsLayer`, this layer rebases both operands into a
 * camera-relative frame in f64 BEFORE narrowing: `rebaseViewProj(view.slab.vp,
 * view.camPos)` folds the eye offset into the vp (zeroing the large view
 * translation), and the ring centre is re-expressed as `worldPos − view.camPos`
 * (a small camera-relative vector). The COSMO sibling passes an ABSOLUTE
 * position + `view.vp`; NEAR0 passes the rebased pair. The renderer is reused
 * UNCHANGED — only what this layer hands it changes.
 *
 * ## CPU-side ringRadiusPx
 *
 * A star has no physical extent, so its `selectionHalo` descriptor carries
 * `radiusMpc: 0`; `selectionRingRadiusPx` then floors the on-screen size to
 * the `galaxyCatalogs.sizePx` px minimum (the same far-field-dot floor the
 * points shader applies), so the ring is a fixed-px circle around the star.
 * `camDist` is the camera-relative centre's length — the star's distance from
 * the eye in the origin-relative NEAR0 frame.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { selectionHalo } from '../../helpers/selectionHaloTable';
import { selectionRingRadiusPx } from '../../helpers/selectionRingRadiusPx';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';

export const near0SelectionRingLayer: ContentLayer = {
  name: 'near0-selection-ring',
  slab: NEAR0,
  target: 'swap',
  blend: 'over',

  enabled(state, _ctx) {
    if (state.gpu.selectionRingRenderer === null) return false;
    const row = state.selectionRows.select;
    // A row drives THIS ring iff the table yields a NEAR0-slab descriptor for
    // its kind. The slab test is the whole point (see the module header): it
    // keeps this layer and the COSMO sibling from both writing the shared
    // renderer's uniforms in one frame.
    const halo = selectionHalo(row);
    return halo !== null && halo.slab === NEAR0;
  },

  draw(pass, view, ctx, state) {
    const row = state.selectionRows.select;
    const halo = selectionHalo(row);
    if (halo === null) return;
    const { radiusMpc, worldPos } = halo;

    // Re-express the ring centre as a small camera-relative vector in f64
    // BEFORE the renderer narrows to f32 — see the module header's rebase seam.
    // `view.camPos` is the origin-relative eye, the frame `view.slab.vp` and the
    // star anchor are built in, so this subtraction zeroes the view translation
    // `rebaseViewProj` folds into the vp.
    const centre: Vec3 = [
      worldPos[0] - view.camPos[0],
      worldPos[1] - view.camPos[1],
      worldPos[2] - view.camPos[2],
    ];
    const camDist = Math.hypot(centre[0], centre[1], centre[2]);
    const ringRadiusPx = selectionRingRadiusPx(
      radiusMpc,
      camDist,
      // The same apparent-size scale the COSMO sibling passes — the NEAR0 draw
      // shares the canvas, so `drawPxPerRad` (height / 2·tan(fovY/2)) applies
      // unchanged; a star's radiusMpc is 0, so this only scales the px floor.
      ctx.drawPxPerRad,
      state.settings.galaxyCatalogs.sizePx,
    );

    // Fold the eye offset into the vp so it pairs with the camera-relative
    // centre. Uses the slab's f64 `vp`, narrowed HERE at the GPU-upload
    // boundary (`rebaseViewProj` stays f64 for consumers that must invert it).
    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, view.camPos));

    state.gpu.selectionRingRenderer!.draw(pass, rebasedVp, view.viewportPx, {
      worldPos: centre,
      ringRadiusPx,
    });
  },
};
