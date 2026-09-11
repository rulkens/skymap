/**
 * near0SelectionRingPass — the selection halo for a picked NEAR0-slab thing
 * (today: a survey star), drawn OVER onto the swap chain post-tone-map.
 *
 * ## Why a NEAR0 sibling to `selectionRingPass`, and why they partition by slab
 *
 * The COSMO `selectionRingPass` and this layer feed the SAME
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
 * pixels. Like `starPointsPass`, this layer rebases both operands into a
 * camera-relative frame in f64 BEFORE narrowing: `rebaseViewProj(view.slab.vp,
 * view.camPos)` folds the eye offset into the vp (zeroing the large view
 * translation), and the ring centre is re-expressed as `worldPos − view.camPos`
 * (a small camera-relative vector). The COSMO sibling passes an ABSOLUTE
 * position + `view.vp`; NEAR0 passes the rebased pair. The renderer is reused
 * UNCHANGED — only what this layer hands it changes.
 *
 * ## CPU-side ringRadiusPx
 *
 * A NEAR0 target carries a REAL physical radius, so `near0RingRadiusPx` sizes
 * the halo from it — see that helper's header for the far floor and why the
 * apparent-size term is not the galaxy ring's. The `camDist` it takes is the
 * camera-relative centre's length: the target's distance from the eye in the
 * origin-relative NEAR0 frame.
 *
 * ## Live-body centre — the ring tracks the animated body, not its pick pose
 *
 * A body's `selectionHalo` position is a SNAPSHOT stamped on the SelectionRow at
 * selection time, but the sim clock keeps moving planets and moons along their
 * orbits every frame. Centring on the stale snapshot leaves the ring where the
 * body WAS when picked while the sphere drifts away. So a body row re-resolves
 * its position out of this frame's `sceneBodyStates` snapshot through
 * `liveBodyPosition` — the single live-body resolution site, and the same map
 * the body draw pass reads, so the ring shares the bodies' exact epoch. It returns
 * null for a non-body row AND for a body-typed row absent from the orbital
 * snapshot; the `?? worldPos` fallback covers both, and is right rather than
 * defensive because a row's baked `worldPos` and its snapshot position are the
 * same authored value for anything static — only a body the clock moves needs
 * the live re-read at all.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { selectionHalo } from '../../helpers/selectionHaloTable';
import { liveBodyPosition } from '../../camera/liveBodyPosition';
import { sceneBodyStates } from '../sceneBodyStates';
import { sceneOccluderBodies } from '../sceneOccluderBodies';
import { near0RingRadiusPx } from '../../helpers/near0RingRadiusPx';
import { overflowFade } from '../../../../utils/scene/overflowFade';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { NEAR0_OVERLAY_CLIP_SCALE, near0OverlayVpF32 } from '../near0OverlayClip';
import { clampVec3Length } from '../../../../utils/math/clampVec3Length';
import { NEAR0_FAR_CLAMP_FRACTION } from '../../../../utils/camera/foregroundFrustum';
import { subjectOccludedByBodies } from '../../../../utils/scene/subjectOccludedByBodies';
import { pinInsideNearPlane } from '../../../../utils/camera/pinInsideNearPlane';

export const near0SelectionRingPass: ContentPass = {
  name: 'near0-selection-ring',
  slab: NEAR0,
  target: 'swap',
  blend: 'over',

  enabled(state, _ctx, _view) {
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

    // Re-resolve a body row's LIVE position at this frame's sim epoch so the ring
    // tracks the animated planet/moon instead of its stale pick-time snapshot
    // (see the module header). A row the snapshot cannot place falls back to the
    // baked `worldPos`, which is the same value for anything static.
    const centreWorld = liveBodyPosition(row, sceneBodyStates(state, ctx)) ?? worldPos;

    // Re-express the ring centre as a small camera-relative vector in f64
    // BEFORE the renderer narrows to f32 — see the module header's rebase seam.
    // `view.camPos` is the origin-relative eye, the frame `view.slab.vp` and the
    // star anchor are built in, so this subtraction zeroes the view translation
    // `rebaseViewProj` folds into the vp.
    const centre: Vec3 = [
      centreWorld[0] - view.camPos[0],
      centreWorld[1] - view.camPos[1],
      centreWorld[2] - view.camPos[2],
    ];
    const camDist = Math.hypot(centre[0], centre[1], centre[2]);
    const { ringRadiusPx, apparentRadiusPx } = near0RingRadiusPx(
      radiusMpc,
      // The TRUE camera distance — NOT the far-plane-clamped length below. The
      // ring's apparent size (the 1.5×-apparent term) must stay physical, so it
      // reads where the anchor really is, even when we pull the centre inward
      // for depth.
      camDist,
      // The same apparent-size scale the COSMO sibling passes — the NEAR0 draw
      // shares the canvas, so `drawPxPerRad` (height / 2·tan(fovY/2)) applies
      // unchanged. It sizes both the far floor and the 1.5×-apparent term.
      ctx.drawPxPerRad,
      state.settings.galaxyCatalogs.sizePx,
    );

    // A ring wider than the screen is a stray arc beside the body, not a "this
    // one" affordance, so it dissolves as the subject outgrows the viewport —
    // the same rule the lifted caption rides. At zero, skip the draw entirely.
    const alpha = overflowFade(2 * apparentRadiusPx, Math.min(...view.viewportPx));
    if (alpha <= 0) return;

    // Fold the eye offset into the vp so it pairs with the camera-relative
    // centre, then rescale to clip metres (`near0OverlayClip`) and narrow HERE,
    // at the GPU-upload boundary: the rescale is this pass's own because the
    // ring renderer is shared with the COSMO sibling, which must not carry it.
    const rebasedVp = near0OverlayVpF32(rebaseViewProj(view.slab.vp, view.camPos));

    // Keep the centre between the slab's planes — BOTH can be crossed. The
    // adaptive far plane (`max(orbit·100, 3e-11)` Mpc, `foregroundFrustum`)
    // drops below a pinned anchor when the orbit target is much nearer; the
    // near plane is FLOORED at `MIN_NEAR_MPC` (~6.2 m) while a mesh body parks
    // the camera at two of its own radii (0.9 m for the bowl of petunias). One
    // clip z/w serves all six quad vertices, so outside either plane the whole
    // primitive is discarded and the halo vanishes rather than clips. Scaling
    // the centre is exactly screen-preserving (`clampVec3Length`'s header), the
    // px radius rides `w` and divides it back out, and this OVER-blended pass
    // never depth-tests — so only depth moves.
    const clampedCentre = pinInsideNearPlane(
      clampVec3Length(centre, view.slab.far * NEAR0_FAR_CLAMP_FRACTION),
      rebasedVp,
      view.slab.near * NEAR0_OVERLAY_CLIP_SCALE,
    );

    // The per-pixel occlusion variant is selected by HANDING the renderer a
    // scene colour view, so the depth verdict is made here: only a ring whose
    // subject an opaque body actually hides gets attenuated, and then only
    // while the body pass has written this frame's `foreground:0` (else the
    // colour is stale and would blank the whole ring).
    const occluded =
      ctx.renderedTargets.has('foreground:0') &&
      subjectOccludedByBodies({
        subjectMpc: centreWorld,
        camPosMpc: view.camPos,
        bodies: sceneOccluderBodies(state, ctx),
      });

    state.gpu.selectionRingRenderer!.draw(
      pass,
      rebasedVp,
      view.viewportPx,
      { worldPos: clampedCentre, ringRadiusPx, alpha },
      occluded ? ctx.renderTargets.viewOf('foreground:0') : undefined,
    );
  },
};
