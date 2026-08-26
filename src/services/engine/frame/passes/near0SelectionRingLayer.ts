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
 * A NEAR0 target (a survey star, a planet, Earth, a scene star) is drawn as a
 * real sphere, so its `selectionHalo` descriptor carries a REAL physical
 * radius (`radiusM` → Mpc) and `near0RingRadiusPx` sizes the halo like the
 * galaxy ring: `max(farFloor, 1.5 × apparentRadiusPx)`. Far away the sphere is
 * sub-pixel and the far floor wins — the same fixed-px `galaxyCatalogs.sizePx ·
 * 6` dot the COSMO helper produces at radius 0 — so nothing changes at
 * distance. Once the sphere resolves, the 1.5×-apparent term takes over and the
 * ring hugs the silhouette instead of sitting as a fixed dot lost inside it.
 *
 * For the apparent-size term it deliberately does NOT reuse the galaxy
 * `selectionRingRadiusPx` (the far floor DOES delegate to it — `selectionRingRadiusPx(0, …)`
 * reproduces the fixed-px dot): that helper bakes billboard provenance (a 2×
 * padded footprint input, a `× 0.5` padding-cancel, then a × 6 ring scale — a
 * NET × 3 on apparent radius) sized for a soft point glow, which would balloon
 * around a hard sphere. The 1.5×
 * apparent term matches how the sphere is actually drawn (r/d radians, see
 * `bodyApparentDiameterPx`), so the ring meets the sphere at the resolve
 * handoff. `camDist` is the camera-relative centre's length — the target's
 * distance from the eye in the origin-relative NEAR0 frame.
 *
 * ## Live-body centre — the ring tracks the animated body, not its pick pose
 *
 * A body's `selectionHalo` position is a SNAPSHOT stamped on the SelectionRow at
 * selection time, but the sim clock keeps moving planets and moons along their
 * orbits every frame. Centring on the stale snapshot leaves the ring where the
 * body WAS when picked while the sphere drifts away. So a body row re-resolves
 * its position at THIS frame's `ctx.simDays` through `liveBodyPosition` — the
 * single live-body resolution site (it reads the same one-deep-memoized
 * `deriveBodyStates(simDays)` map the body draw pass already built this frame, so
 * the re-read is free and the ring shares the bodies' exact epoch). It returns
 * null for a non-body row AND for a body-typed row absent from the orbital
 * snapshot; the `?? worldPos` fallback covers both, and is right rather than
 * defensive because a row's baked `worldPos` and its snapshot position are the
 * same authored value for anything static — only a body the clock moves needs
 * the live re-read at all.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { selectionHalo } from '../../helpers/selectionHaloTable';
import { liveBodyPosition } from '../../camera/liveBodyPosition';
import { near0RingRadiusPx } from '../../helpers/near0RingRadiusPx';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { clampVec3Length } from '../../../../utils/math/clampVec3Length';
import { NEAR0_FAR_CLAMP_FRACTION } from '../../../../utils/camera/foregroundFrustum';

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

    // Re-resolve a body row's LIVE position at this frame's sim epoch so the ring
    // tracks the animated planet/moon instead of its stale pick-time snapshot
    // (see the module header). A row the snapshot cannot place falls back to the
    // baked `worldPos`, which is the same value for anything static.
    const centreWorld = liveBodyPosition(row, ctx.simDays) ?? worldPos;

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
    const ringRadiusPx = near0RingRadiusPx(
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

    // Pull the centre inside the NEAR0 far plane when the pinned anchor sits
    // beyond it. The adaptive far plane is `max(orbit·100, 3e-11)` Mpc
    // (`foregroundFrustum`), so orbiting something much nearer than the pinned
    // halo anchor drops the far plane below the anchor's distance and the ring
    // quad — unlike the star SPRITE, which clamps clip-z inside the far plane
    // (the sibling `CLIP_Z_EPS` far-clamp solves this same sweep) — has no clamp
    // and gets frustum-clipped, so the halo vanishes mid-zoom. Scaling the
    // camera-relative centre is EXACTLY correct here: with the rebased vp (view
    // translation folded out) a uniform scale moves camera-space x/y/z together,
    // so the projected NDC x/y (ratios against w ∝ z) are IDENTICAL — only depth
    // moves inward — and the OVER-blended ring pass never depth-tests, so depth
    // is otherwise unobserved. Far side only: in practice the orbit target is
    // always at or beyond the anchor's scale when zoomed out, so the anchor can
    // only ever exit the FAR plane, never the near — no symmetric near clamp.
    const clampedCentre = clampVec3Length(centre, view.slab.farMpc * NEAR0_FAR_CLAMP_FRACTION);

    // Fold the eye offset into the vp so it pairs with the camera-relative
    // centre. Uses the slab's f64 `vp`, narrowed HERE at the GPU-upload
    // boundary (`rebaseViewProj` stays f64 for consumers that must invert it).
    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, view.camPos));

    state.gpu.selectionRingRenderer!.draw(pass, rebasedVp, view.viewportPx, {
      worldPos: clampedCentre,
      ringRadiusPx,
    });
  },
};
