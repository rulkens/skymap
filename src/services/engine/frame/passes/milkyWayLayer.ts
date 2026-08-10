/**
 * milkyWayLayer — the Milky Way point cloud's DUST pass, plus the cloud's pick
 * aspect, at the galactic centre (`MILKY_WAY_CENTER_WORLD`, the ~8 kpc Sgr A*
 * offset from the observer origin, applied via the model matrix).
 *
 * ### What it draws (and what it no longer draws)
 *
 * The cloud is generated on-GPU (`milkyWayCloud` owns the star/dust instance
 * buffers) and drawn by `milkyWayCloudRenderer` in two pipelines that now live
 * in two different layers, because they render into two different targets:
 *
 *   - the ADDITIVE star pass moved to `milkyWayAggregateLayer`, which draws it
 *     into the reduced-resolution `mw-aggregate` offscreen;
 *     `milkyWayUpsampleLayer` composites that back into HDR. It is the
 *     fill-bound half and its summed glow is low-frequency, so it buys the
 *     square of the divisor in fragment cost for a bilinear interpolation
 *     nobody can see. See that layer's header.
 *   - the MULTIPLICATIVE dust pass stays HERE, full-res in HDR: per-channel
 *     transmittance that darkens + reddens the light behind it, which means it
 *     has to land on the real cosmological accumulation.
 *
 * The dust sprites are camera-facing billboards built from the live camera
 * basis each frame; the cloud's world placement (fixed galactic orientation +
 * scale + the Sgr A* centre offset) is `milkyWayModelCached`, built once and
 * shared with the aggregate layer.
 *
 * ### When it draws
 *
 * `enabled` delegates to `deriveMilkyWayCloudAlpha` — the ONE home of the
 * cloud's visibility question, shared with the aggregate producer and its
 * upsample consumer so the three can never disagree (see
 * `milkyWayCloudLiveness`). The pick program runs this SAME gate against the
 * pick-time camera, so draw and pick can't drift either. It folds three
 * factors:
 *
 *   1. `state.settings.milkyWay.enabled` — user toggle — OR a still-
 *      nonzero toggle fade (`fades.opacityOf`), which keeps the layer
 *      alive through the ~100 ms fade-out tail.
 *   2. `milkyWayFadeAlpha` — the far-side apparent-size fade band defined in
 *      `services/gpu/galaxy/milkyWayFadeAlpha.ts` (full strength while the
 *      disc spans at least `MILKY_WAY_FADE_FULL_PX` on screen, gone once it
 *      shrinks to `MILKY_WAY_FADE_GONE_PX`).
 *   3. `fadeBand(SCALE_FADE_BANDS.milkyWayApproach, camDist)` — the
 *      near-side fade: the cloud rides the descent into the disc at full
 *      strength down to 2 kpc, then dissolves against the real Gaia star
 *      catalog (fully faded in inside 8 kpc), gone by 200 pc (the exact band
 *      is the `milkyWayApproach` row in `presentation/scaleFadeBands.ts`).
 *      Orthogonal to factor 2's apparent-size band — it is the
 *      only one that closes at kpc range. Because it rides `enabled` it also
 *      makes a fully approach-faded disc unpickable (invisible →
 *      unpickable) — coherent, but a behaviour the pick program inherits
 *      for free from the shared gate.
 *
 * A null result skips the whole layer: no `beginRenderPass`, no tile-RAM
 * round-trip on M1, and no idle timestamp slot in the GPU-timings panel.
 *
 * ### The one place draw and pick DO diverge: `pickEnabled` closes earlier
 *
 * `pickEnabled` is `enabled` AND a floor on the camera's origin distance — the
 * ONE gate in the registry where the pick set is NARROWER than the draw set
 * (see `MILKY_WAY_PICK_MIN_DISTANCE_MPC`, and `ContentLayer.pickEnabled` on why
 * that direction needs its own justification).
 *
 * ### Why NEAR0, not COSMO (the fifth layer to hit the near-plane trap)
 *
 * COSMO's near plane is FIXED at 10 kpc (`COSMO_NEAR_MPC`, slabs.ts) — but the
 * disc's near edge sits only ~9.5 kpc from the heliocentric origin the camera
 * descends toward (Sgr A* is ~8 kpc out, and the cloud extends back toward the
 * Sun). On the way down that plane slices visibly through the clumps while the
 * approach fade (full to 2 kpc) still shows them at full strength — a hard
 * clip mid-crossfade. NEAR0's near/far track the camera's orbit distance, so
 * the disc clears the near plane for the whole descent — the same fix
 * `starPointsLayer`, `starCatalogLayer`, `orbitTrailsLayer`, and
 * `foregroundLabelsLayer` each landed before this row.
 *
 * Unlike those four there is NO f64 rebase seam here: the cloud's anchors are
 * kpc-scale (~8e-3 Mpc from the origin), so the f32 large-minus-large
 * cancellation that jitters parsec/AU-scale anchors is bounded at ~1e-9 Mpc —
 * deeply sub-pixel against a kpc-sized disc viewed from ≥200 pc. The layer
 * keeps handing the renderer the narrowed `view.vp` and the world-space model
 * matrix. NEAR0's ADAPTIVE far plane is the one new hazard: on a deep descent
 * (or a tight orbit of another local-volume body) it pulls inside the disc's
 * far edge, so the star/dust vertex stages clamp clip-z just inside the far
 * plane — safe because both passes are depthless (see stars.wesl / dust.wesl).
 *
 * ### What it reads
 *
 * - `state.gpu.milkyWayCloudRenderer` (the two-pass star/dust draw)
 * - `state.gpu.milkyWayCloud` (the generated instance buffers)
 * - `ctx.cam` (billboard basis), `view.vp`, `view.viewportPx`, `view.camPos`
 * - `state.settings.milkyWay.enabled` (user toggle, via the gate)
 *
 * ### Why drawn FIRST inside the (hdr, NEAR0) group
 *
 * The (hdr, NEAR0) step runs after the whole (hdr, COSMO) group, so the dust
 * pass's MULTIPLICATIVE transmittance darkens the full cosmological
 * accumulation behind it (points, disks, filaments, volumes) — physically
 * reasonable extinction of background light. Leading the NEAR0 group keeps
 * the local starfield (star-points / star-catalog, drawn after) out of that
 * multiply: during the descent the near-field stars sit between the camera
 * and the dust, so they must never be darkened by it.
 *
 * `milkyWayUpsampleLayer` is the ONE row that must precede this one: it adds
 * the cloud's own starlight into HDR, and the dust has to multiply that too
 * (which is what the single-pass version did when stars and dust shared an
 * encoder). Everything else in the group still draws after.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { pickUniformBytesOf } from '../../helpers/pickUniformBytesOf';
import { deriveMilkyWayCloudAlpha } from '../milkyWayCloudLiveness';
import { cameraBillboardBasis } from '../../../../utils/camera/cameraBillboardBasis';
import { milkyWayModelCached } from '../../../gpu/galaxy/milkyWayModelCached';

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

export const milkyWayLayer: ContentLayer = {
  name: 'milky-way',
  // NEAR0, not COSMO: the fixed 10 kpc cosmological near plane clips the disc
  // mid-descent before the approach fade completes — see the module header.
  slab: NEAR0,
  target: 'hdr',
  blend: 'multiply',

  // Shared with the aggregate producer and its upsample consumer — see
  // `milkyWayCloudLiveness` on why all three must answer identically.
  enabled(state, ctx) {
    return deriveMilkyWayCloudAlpha(state, ctx) !== null;
  },

  // Pick gate — NARROWER than `enabled`, the only row in the registry that way
  // round (see `ContentLayer.pickEnabled`). The disc stays DRAWN all the way
  // down to the 200 pc approach fade, but stops taking clicks once the camera
  // is inside it: `MILKY_WAY_PICK_MIN_DISTANCE_MPC` above carries the why.
  // Composed over `enabled` rather than restating its three terms, so the
  // shared gates cannot drift and pick stays a strict subset of draw.
  pickEnabled(state, ctx) {
    if (!milkyWayLayer.enabled(state, ctx)) return false;
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return camDistMpc >= MILKY_WAY_PICK_MIN_DISTANCE_MPC;
  },

  draw(pass, view, ctx, state) {
    // Defensive re-derivation, mirroring the sibling layers: `enabled` already
    // proved liveness, but re-deriving keeps this a pure function of
    // (state, ctx) with no reliance on gate ordering.
    const fadeAlpha = deriveMilkyWayCloudAlpha(state, ctx);
    if (fadeAlpha === null) return;
    // The cloud buffers live on `state.gpu` (nullable, like every GPU handle).
    // They are non-null once the frame loop runs, but `enabled` doesn't
    // narrow them, so guard here — the pre-bootstrap window is the only
    // case this fires. Same for the renderer itself.
    const cloud = state.gpu.milkyWayCloud;
    if (cloud === null) return;
    const cloudRenderer = state.gpu.milkyWayCloudRenderer;
    if (cloudRenderer === null) return;

    // Camera-facing billboard axes for the dust sprites (world space),
    // derived from the live camera each frame.
    const { right: camRight, up: camUp } = cameraBillboardBasis(ctx.cam);

    cloudRenderer.drawDust(pass, {
      vp: view.vp,
      // Full-res into HDR, so the canvas viewport is the target viewport. (The
      // dust pass's own size clamp is in NDC, not pixels, so this only feeds
      // the shared camera prefix — but keeping it honest costs nothing.)
      viewportPx: view.viewportPx,
      camRight,
      camUp,
      model: milkyWayModelCached(),
      fadeAlpha,
      // The live look knobs, same as the aggregate row. The dust pass reads
      // only the model scale and fade out of the shared uniform struct, but it
      // packs the whole struct, so the values still have to be present.
      tuning: state.settings.milkyWay,
      buffers: cloud.buffers(),
    });
  },

  // Pick aspect — stamps the single invisible pick billboard at the
  // galactic centre. `pickMilkyWay` sizes it on the GPU from the pick-camera
  // uniform, so there is no CPU size argument.
  //
  // This row SELF-BINDS its @group(0) pick camera: the NEAR0 pick pass carries
  // no shared point-sprites prefix (that @group(0) contract is a COSMO-pass
  // fact), so this row cannot inherit a camera from an earlier draw. The Gaia
  // star catalog — the other NEAR0 pickable — self-binds its own camera the same
  // way, so the two are order-independent within the pass.
  // The bytes are the SAME complete pick image point-sprites uploads —
  // `pickUniformBytesOf` against THIS row's slab view — so the billboard's
  // in-shader sizing reads the identical camera facts, just projected through
  // NEAR0. Self-binding also deletes the hidden order dependence the old
  // inherit-slot-0 pattern carried (a registry reshuffle could silently feed
  // the MW pick a stale camera); the COSMO pickables keep the inherit pattern
  // because their shared prefix is re-bound by point-sprites every pass.
  //
  // Visibility is NOT re-checked here: the pick program filters by this row's
  // `pickEnabled`, evaluated against the pick-time camera. That gate composes
  // over `enabled` — the same derivation the draw program runs — so the pick
  // answer can only ever be a SUBSET of the draw answer, never a drift from it.
  // The renderer-null guard follows `draw`'s pre-bootstrap pattern.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.milkyWayPickRenderer;
    if (pickRenderer === null) return;
    pickRenderer.pickMilkyWay(pass, pickUniformBytesOf(view, ctx, state));
  },
};
