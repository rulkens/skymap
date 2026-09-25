/**
 * milkyWayPass — the Milky Way point cloud's DUST pass, plus the cloud's pick
 * aspect, at the galactic centre (`MILKY_WAY_CENTER_WORLD`, the ~8 kpc Sgr A*
 * offset from the observer origin, applied via the model matrix).
 *
 * The MULTIPLICATIVE dust pass stays here, full-res in HDR, because its
 * per-channel transmittance has to land on the real cosmological
 * accumulation; the ADDITIVE star pass lives in `milkyWayAggregatePass`
 * instead (see that layer's header for why). Dust sprites are camera-facing
 * billboards from the live camera basis; the cloud's world placement is
 * `milkyWayModelCached`, shared with the aggregate layer.
 *
 * `enabled` delegates to `deriveMilkyWayCloudAlpha` — the ONE home of the
 * cloud's visibility question, shared with the aggregate producer and its
 * upsample consumer so the three can never disagree (`milkyWayCloudLiveness`).
 * The pick program runs the SAME gate against the pick-time camera, so draw
 * and pick can't drift. A null result skips the whole layer: no
 * `beginRenderPass`, no tile-RAM round-trip, no idle timestamp slot.
 *
 * `pickEnabled` is the one place draw and pick diverge: `enabled` AND a floor
 * on the camera's origin distance (`MILKY_WAY_PICK_MIN_DISTANCE_MPC`) — the
 * only registry gate where the pick set is NARROWER than the draw set (see
 * `ContentPass.pickEnabled` on why that direction needs its own
 * justification).
 *
 * Slab is NEAR0, not COSMO: COSMO's near plane is fixed at 10 kpc
 * (`COSMO_NEAR_MPC`, slabs.ts), but the disc's near edge sits only ~9.5 kpc
 * from the heliocentric origin, so on the way down that plane would slice
 * visibly through the clumps while the approach fade (full to 2 kpc) still
 * shows them — a hard clip mid-crossfade. NEAR0's near/far track the camera's
 * orbit distance instead, the same fix `starPointsPass`, `starCatalogPass`,
 * `orbitTrailsPass`, and `foregroundLabelsPass` each carry. Unlike those
 * four there is no f64 rebase seam here: the cloud's kpc-scale anchors bound
 * the f32 large-minus-large cancellation at ~1e-9 Mpc, deeply sub-pixel
 * against a kpc-sized disc. NEAR0's adaptive far plane is the one hazard it
 * adds: on a deep descent it can pull inside the disc's far edge, so the
 * star/dust vertex stages clamp clip-z just inside it — safe because both
 * passes are depthless (stars.wesl / dust.wesl).
 *
 * Drawn FIRST inside the (hdr, NEAR0) group, which runs after the whole (hdr,
 * COSMO) group: the dust pass's multiplicative transmittance should darken the
 * full cosmological accumulation behind it, but must NOT darken the near-field
 * starfield (star-points / star-catalog) that sits between the camera and the
 * dust during descent — so this layer leads the group and those draw after.
 * `milkyWayUpsamplePass` is the one row that must still precede it: it adds
 * the cloud's own starlight into HDR, which the dust then has to multiply too.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { MilkyWayRuntime } from '../@types/MilkyWayRuntime';
import { deriveMilkyWayCloudAlpha } from '../present/milkyWayCloudLiveness';
import { milkyWayCamPosModel } from '../../../services/engine/galaxyGenerator/v1/milkyWayCamPosModel';
import { milkyWayModelCached } from '../../../services/engine/galaxyGenerator/v1/milkyWayModelCached';

/**
 * Camera origin distance (Mpc) below which the impostor stops taking clicks —
 * the camera is inside the galaxy and its hit target has swallowed the view.
 *
 * The pick billboard is ONE disc sized from `MILKY_WAY_RADIUS_MPC` (17.5 kpc),
 * so its screen radius grows as the camera closes: by ~27 kpc it already spans
 * more than the viewport height and every click that isn't a star lands on the
 * Milky Way. Worse, the impostor is on NEAR0 and the cross-slab fold
 * (`frontmostPick`) is SLAB-ordered, not depth-ordered — so a NEAR0 hit beats
 * every COSMO galaxy and structure marker outright, and the backdrop's
 * "ultimate fallback" depth band (`lib/pickDepthBands.wesl`) only ranks it
 * within its own slab. Inside this distance the impostor is scenery you are
 * flying through, not a target, so pick reverts to the content in front of it.
 *
 * Eye-tuned by the user, not derived: this is where the disc's click target
 * stopped being useful in practice.
 */
const MILKY_WAY_PICK_MIN_DISTANCE_MPC = 0.0271;

export function milkyWayPass(runtime: MilkyWayRuntime): ContentPass {
  // Shared with the aggregate producer and its upsample consumer — see
  // `milkyWayCloudLiveness` on why all three must answer identically. Named
  // so `pickEnabled` can call it directly instead of self-referencing the
  // returned pass object.
  function enabled(state: PassState, ctx: FrameView, _view: SlabView): boolean {
    return deriveMilkyWayCloudAlpha(state, ctx) !== null;
  }

  return {
    name: 'milky-way',

    enabled,

    // Pick gate — NARROWER than `enabled`, the only row in the registry that way
    // round (see `ContentPass.pickEnabled`). The disc stays DRAWN all the way
    // down to the 200 pc approach fade, but stops taking clicks once the camera
    // is inside it: `MILKY_WAY_PICK_MIN_DISTANCE_MPC` above carries the why.
    // Composed over `enabled` rather than restating its three terms, so the
    // shared gates cannot drift and pick stays a strict subset of draw.
    pickEnabled(state, ctx, view) {
      if (!enabled(state, ctx, view)) return false;
      const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
      return camDistMpc >= MILKY_WAY_PICK_MIN_DISTANCE_MPC;
    },

    draw(pass, view, ctx, state) {
      // Defensive re-derivation, mirroring the sibling layers: `enabled` already
      // proved liveness, but re-deriving keeps this a pure function of
      // (state, ctx) with no reliance on gate ordering.
      const fadeAlpha = deriveMilkyWayCloudAlpha(state, ctx);
      if (fadeAlpha === null) return;

      runtime.cloudRenderer.drawDust(pass, {
        vp: view.vp,
        // Full-res into HDR, so the canvas viewport is the target viewport. (The
        // dust pass's own size clamp is in NDC, not pixels, so this only feeds
        // the shared camera prefix — but keeping it honest costs nothing.)
        viewportPx: view.viewportPx,
        pxPerRad: ctx.drawPxPerRad,
        // The eye, not a view plane: every sprite builds its own basis from it,
        // so a dust blob reads the same from every view of one rig.
        camPosModel: milkyWayCamPosModel(ctx.drawCamPos),
        model: milkyWayModelCached(),
        fadeAlpha,
        // The live look knobs, same as the aggregate row. The dust pass reads
        // only the model scale and fade out of the shared uniform struct, but it
        // packs the whole struct, so the values still have to be present.
        tuning: state.settings.milkyWay,
        buffers: runtime.cloud.buffers(),
      });
    },

    // Pick aspect — stamps the single invisible pick billboard at the
    // galactic centre. `pickMilkyWay` sizes it on the GPU from the pick-camera
    // uniform, so there is no CPU size argument.
    //
    // This row SELF-BINDS its @group(0) pick camera, like every other pickable
    // row, so pick rows are order-independent within a pass. The camera facts
    // come from THIS row's slab view, so the billboard's in-shader sizing reads
    // the same values the point pick reads, just projected through NEAR0.
    //
    // Visibility is NOT re-checked here: the pick program filters by this row's
    // `pickEnabled`, evaluated against the pick-time camera. That gate composes
    // over `enabled` — the same derivation the draw program runs — so the pick
    // answer can only ever be a SUBSET of the draw answer, never a drift from it.
    drawPick(pass, view, ctx) {
      runtime.pickRenderer.pickMilkyWay(
        pass,
        view.vp,
        view.viewportPx,
        view.camPos,
        ctx.drawPxPerRad,
      );
    },
  };
}
