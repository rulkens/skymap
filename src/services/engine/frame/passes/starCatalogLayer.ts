/**
 * starCatalogLayer — the survey (Gaia bin) stars as additive point sprites in
 * the depthless HDR accumulation, the wide-field twin of `starPointsLayer`.
 *
 * ### What it draws
 *
 * Every catalog committed to the star renderer (`loadedCatalogs()`), drawn one
 * source at a time. Each source's octree is walked CPU-side per frame
 * (`walkStarOctreeCut`) into a flux-mip cut — near cells refined to their real
 * leaf stars, far/sub-pixel subtrees collapsed to one aggregate record — so the
 * drawn instance count stays inside the source's `drawBudget` regardless of the
 * millions of stars on disk. Where `starPointsLayer` draws a handful of
 * hand-seeded neighbourhood stars, this row draws the bulk near-field Gaia bin.
 *
 * ### Why NEAR0 + the f64 rebase seam (same trap as `starPointsLayer`)
 *
 * COSMO's near plane (0.01 Mpc) would clip the parsec-scale star anchors, so
 * this row projects through NEAR0 while still accumulating into the HDR target
 * so the stars ride the same tone-map as the galaxies. And like the seeded
 * point anchors, each octree node's box origin is a parsec-scale coordinate
 * near-equal to the NEAR0 view translation during the local-map approach: an
 * f32 subtraction cancels catastrophically and jitters the sprites. So the
 * layer rebases in f64 before narrowing — the node origins via
 * `starNodeOriginRelCamMpc` (each box origin re-expressed camera-relative), and
 * the vp via `narrowMat4(rebaseViewProj(view.slab.vp, camPos))`. The renderer
 * stays a dumb f32 pipeline; the precision seam lives here.
 *
 * ### The shared-vp invariant (load-bearing)
 *
 * The star renderer's camera uniform is ONE shared buffer rewritten on every
 * `draw` call — safe only because every source in a frame receives the
 * IDENTICAL rebased vp. So the rebased vp (and the camera-relative parsec
 * position the walker uses) is computed ONCE per frame, before the per-source
 * loop, and the same matrix reference is handed to every source's draw. There
 * is deliberately no per-source rebase.
 *
 * ### The crossfade — a recede band to the procedural Milky-Way cloud
 *
 * The near-field star bubble hands off to the procedural Milky-Way point cloud
 * as the camera pulls back to galactic scale (spec §7, ~2→5 kpc). That handoff
 * is a recede-direction `fadeBand` keyed on the camera's heliocentric parsec
 * distance, endpoints carried per-source in the registry row's `crossfadePc`
 * ({ inner, outer }): full inside `inner`, gone past `outer`. The MW impostor's
 * own `milkyWayApproach` band fades it in the complementary direction, so the
 * two crossfade across the same kpc window. The band IS the far gate — there is
 * no `FOREGROUND_MAX_DISTANCE_MPC` cut, because the bubble extends well past the
 * ≤25 pc scene stars. V1 accepts a visible density seam (calibration deferred).
 *
 * ### Per-node LOD fades — dissolving the octree-box pop
 *
 * The draw cut (`walkStarOctreeCut`) is a budget-limited best-first walk re-run
 * every frame, so it is VIEW-DEPENDENT: rotating changes which nodes make the
 * cut, and a split/merge transition swaps a parent aggregate for its children
 * instantly. Left alone, every membership change is a hard one-frame pop — the
 * user sees octree boxes flicker in and out while navigating. So the layer keeps
 * a persistent per-node fade (`fadeStateByCatalog`) and ramps each node's opacity
 * 0→1 as it enters the cut and 1→0 as it leaves, holding a leaving node in the
 * draw list until it reaches 0. The per-node draw opacity handed to the renderer
 * is `sourceCrossfade × nodeFade`. A split crossfades exactly (see `NODE_FADE_MS`
 * on why linear conserves flux). Mid-ramp frames wake the loop below.
 *
 * ### When it draws (house rule: gate at `enabled`, opacity 0 ⇒ no render)
 *
 * `enabled` gates on the `starCatalogRenderer` handle (null pre-bootstrap), the
 * `starCatalogs.enabled` master gate, and at least one loaded catalog whose
 * per-item toggle is on AND whose crossfade opacity is still > 0. An additive
 * pass drawing nothing is correctly invisible, but skipping it wholesale also
 * skips the `beginRenderPass` and the tile-RAM round-trip — so a fully-faded or
 * toggled-off bubble costs zero GPU. `enabled` reads the absolute camera
 * (`ctx.drawCamPos`) while `draw` reads NEAR0's origin-relative `view.camPos`;
 * the two coincide because `RENDER_ORIGIN_MPC` is the heliocentric origin.
 *
 * ### Not pickable, and the Sun-exclusion note
 *
 * The Gaia bin carries no `drawPick` — stars are not persisted to a stable id
 * and the layer stays out of the parked foreground-body-picking item (spec §6).
 * The Sun is excluded from the catalog at build time (it is the origin, drawn
 * by the true-scale `starSpheresLayer`/`starPointsLayer` seed), so the octree
 * carries no record at [0,0,0] to double the local starfield.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogSourceEntry } from '../../../../@types/data/starCatalog/StarCatalogSourceEntry';
import type { StarNodeDraw } from '../../../gpu/renderers/starCatalog/walkStarOctreeCut';
import { NEAR0 } from '../slabs';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { walkStarOctreeCut } from '../../../gpu/renderers/starCatalog/walkStarOctreeCut';
import { starNodeOriginRelCamMpc } from '../../../gpu/renderers/starCatalog/starNodeOriginRelCamMpc';
import { starExposureRamp } from '../../../gpu/renderers/starCatalog/starExposureRamp';
import { subtreeStarCounts } from '../../../gpu/renderers/starCatalog/subtreeStarCounts';
import { SOURCE_REGISTRY } from '../../../../data/sources';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

// The star octree grid is parsec-based; the scene frame is Mpc. This is the
// inverse of PC_TO_MPC, kept a single source of truth off SCALE_UNITS.
const MPC_TO_PC = 1 / SCALE_UNITS.PC_TO_MPC;

/**
 * Milliseconds for a node's LOD fade to travel the full 0→1 (or 1→0). Linear
 * ramp: complementary linear fades conserve total glow flux EXACTLY across a
 * split/merge, because a record's integrated screen luminance is linear in its
 * opacity, and an aggregate's flux equals the summed flux of the children that
 * replace it — so `parentFlux·(1−t) + childrenFlux·t = F` for all t. An eased
 * ramp would momentarily under- or over-count. 250 ms is quick enough to feel
 * instant while still killing the single-frame box-pop.
 */
const NODE_FADE_MS = 250;

/** One octree node's temporal LOD-fade state: current opacity + where it heads. */
type NodeFade = { opacity: number; target: number };

/**
 * A catalog's per-node LOD-fade state, persisted across frames. The best-first
 * cut (`walkStarOctreeCut`) is view-dependent — rotating the camera or crossing
 * a split/merge threshold changes which nodes are in the cut — so every
 * membership change would be a hard one-frame pop without this. Each frame:
 * nodes newly in the cut enter at opacity 0 heading to 1; nodes that left the
 * cut stay in the draw list heading to 0, and are dropped once they reach 0.
 *
 * Keyed by the CATALOG object, not the source code, for two free properties:
 *   1. Test + tier-swap isolation — a replaced catalog (tier change) is a new
 *      object, so it starts with fresh fade state and the old map is GC'd via
 *      the WeakMap; a stale node index can never index into the wrong catalog.
 *   2. It is still per-SOURCE in practice — the renderer holds exactly one
 *      catalog per source (`loadedCatalogs` yields one each), so per-catalog IS
 *      per-source, with none of the manual invalidation source-keying needs.
 *
 * `clockMs` is the catalog's own last-drawn frame time, so `dt` is derived
 * without a shared module clock (every catalog is drawn on the same frame, so a
 * per-catalog clock yields the identical dt a global one would). `null` on the
 * first frame a catalog is seen, which snaps every node straight to its target:
 * the star bubble's first paint is its steady state, and only later membership
 * CHANGES animate — the same first-frame rule `foregroundLabelsLayer` uses.
 */
type StarFadeState = { fades: Map<number, NodeFade>; clockMs: number | null };
const fadeStateByCatalog = new WeakMap<StarCatalog, StarFadeState>();

function fadeStateFor(catalog: StarCatalog): StarFadeState {
  let state = fadeStateByCatalog.get(catalog);
  if (state === undefined) {
    state = { fades: new Map(), clockMs: null };
    fadeStateByCatalog.set(catalog, state);
  }
  return state;
}

/**
 * A source's recede-direction crossfade opacity at the camera's heliocentric
 * parsec distance: full (1) inside `inner`, gone (0) past `outer`. `fadeBand`
 * reads the direction from the edge ordering — `inner < outer` is a recede
 * fade (full at the low edge).
 */
function crossfadeOpacity(entry: StarCatalogSourceEntry, camDistPc: number): number {
  return fadeBand({ fullAt: entry.crossfadePc.inner, goneAt: entry.crossfadePc.outer }, camDistPc);
}

export const starCatalogLayer: ContentLayer = {
  name: 'star-catalog',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    const renderer = state.gpu.starCatalogRenderer;
    if (renderer === null) return false;
    if (!state.settings.starCatalogs.enabled) return false;

    const camDistPc =
      Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]) * MPC_TO_PC;

    // Enabled if ANY loaded catalog is toggled on and still inside its
    // crossfade band. Per-source endpoints, so the fade is evaluated per row.
    for (const { source } of renderer.loadedCatalogs()) {
      const entry = SOURCE_REGISTRY[source];
      if (entry.type !== 'starCatalog') continue;
      if (!state.settings.starCatalogs.items[entry.id].enabled) continue;
      if (crossfadeOpacity(entry, camDistPc) > 0) return true;
    }
    return false;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.starCatalogRenderer;
    if (renderer === null) return;

    const camPos = view.camPos;

    // SHARED-VP INVARIANT: the renderer's camera uniform is ONE buffer rewritten
    // per draw call — safe only because every source this frame gets the
    // IDENTICAL rebased vp. Compute it (and the camera-relative parsec position
    // the walker keys off) ONCE, here, and hand the same values to every source.
    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));
    const camPosPc: Vec3 = [camPos[0] * MPC_TO_PC, camPos[1] * MPC_TO_PC, camPos[2] * MPC_TO_PC];
    const camDistPc = Math.hypot(camPosPc[0], camPosPc[1], camPosPc[2]);

    // The frame clock the per-node LOD fades advance against (see the fade-state
    // note). One value for every source this frame.
    const nowMs = ctx.nowMs;

    // User's live base star-dot size — the twin of `galaxyCatalogs.sizePx` read
    // by pointSpritesLayer. Source-independent, so read it ONCE here and hand
    // the same value to every source's draw (the renderer writes it into the
    // shared camera uniform; the vertex ramp scales by it).
    const sizePx = state.settings.starCatalogs.sizePx;

    // User's live star-brightness trim — the twin of `galaxyCatalogs.brightness`.
    // Also source-independent, so read ONCE and forward the same value to every
    // draw (the vertex stage multiplies the flux-glow peak by it; 1.0 = identity).
    //
    // Scale-dependent DISPLAY exposure rides in here: `starExposureRamp` lifts the
    // whole starfield from its near-field baseline (1x) toward the whole-galaxy
    // anchor as the camera pulls back — the perceptual fix for a monitor that
    // can't dark-adapt (see that module). It reuses the SAME `camDistPc` the
    // crossfade keyed off (converted to Mpc, the ramp's unit), so there is no
    // second distance. The user slider stays a PURE trim on top of the ramp.
    const brightness =
      state.settings.starCatalogs.brightness *
      starExposureRamp(camDistPc * SCALE_UNITS.PC_TO_MPC);

    // The "Detail" knob — CPU walk input, NOT a GPU uniform. Read once and feed
    // it to every source's `walkStarOctreeCut` (lower ⇒ boxes split earlier).
    const refineThreshold = state.settings.starCatalogs.refineThreshold;

    // The "Glow overlap" knob — source-independent GPU uniform, rides beside
    // `sizePx` / `brightness`. The vertex stage spreads aggregate glows by it.
    const glowOverlap = state.settings.starCatalogs.glowOverlap;

    // Tracks whether ANY node is mid-fade across ALL sources this frame, to keep
    // the render-on-demand loop ticking (wake below). One flag per frame, not
    // per source, because a single request wakes the whole loop.
    let anyNodeFading = false;

    for (const { source, catalog } of renderer.loadedCatalogs()) {
      const entry = SOURCE_REGISTRY[source];
      if (entry.type !== 'starCatalog') continue;
      if (!state.settings.starCatalogs.items[entry.id].enabled) continue;

      const sourceCrossfade = crossfadeOpacity(entry, camDistPc);
      if (sourceCrossfade <= 0) continue; // faded out — additive draw of nothing

      // Walk this frame's cut — the set of nodes the budget-limited best-first
      // walk chose. This is the view-dependent membership the fade smooths over.
      const cut = walkStarOctreeCut(catalog, camPosPc, entry.drawBudget, refineThreshold);

      // ── Advance this catalog's per-node LOD fades ────────────────────────────
      // Per-catalog frame clock → dt (see StarFadeState). The first frame a
      // catalog is seen has `clockMs === null`, giving dt = +Infinity, which
      // snaps every node to its target — the steady-state first paint.
      const fadeState = fadeStateFor(catalog);
      const dtMs =
        fadeState.clockMs === null ? Number.POSITIVE_INFINITY : Math.max(0, nowMs - fadeState.clockMs);
      fadeState.clockMs = nowMs;
      const step = Math.min(1, dtMs / NODE_FADE_MS);
      const fades = fadeState.fades;

      // Retarget: nodes in the cut head to full (seeding newcomers at 0), nodes
      // that left the cut head to 0. Membership is by node index.
      const inCut = new Set<number>();
      for (const nodeDraw of cut) {
        inCut.add(nodeDraw.nodeIndex);
        const f = fades.get(nodeDraw.nodeIndex);
        if (f === undefined) fades.set(nodeDraw.nodeIndex, { opacity: 0, target: 1 });
        else f.target = 1;
      }
      for (const [idx, f] of fades) if (!inCut.has(idx)) f.target = 0;

      // Per-node leaf-star counts, derived once per catalog (memoised), so an
      // aggregate draw can hand the shader the multiplier that rebuilds its
      // subtree's summed flux from the record's stored MEAN flux.
      const counts = subtreeStarCounts(catalog);

      // Advance + prune + assemble the draw in ONE pass over the fade map. The
      // draw list is every node still fading (cut nodes fading in, plus nodes
      // that left the cut still fading out) — so a fading-out node draws BEYOND
      // the walk's budget for a few frames. That overdraw is bounded by cut
      // churn (a rotation swaps only the nodes near the frustum edge) and is
      // accepted rather than capped: capping would reintroduce the pop the fade
      // exists to remove.
      const nodeDraws: StarNodeDraw[] = [];
      const originRelCamMpc: Vec3[] = [];
      const cellScaleMpc: number[] = [];
      const isAggregate: number[] = [];
      const subtreeStarCount: number[] = [];
      const opacity: number[] = [];
      for (const [idx, f] of fades) {
        if (f.opacity < f.target) f.opacity = Math.min(f.target, f.opacity + step);
        else if (f.opacity > f.target) f.opacity = Math.max(f.target, f.opacity - step);
        if (f.opacity !== f.target) anyNodeFading = true;

        // Fully faded out: drop it from the map AND the draw list.
        if (f.opacity <= 0 && f.target === 0) {
          fades.delete(idx);
          continue;
        }

        // A node index outlives its catalog only across a tier swap, which hands
        // us a fresh catalog object (and fade state) — so this is belt-and-braces
        // against a stale index; drop it rather than deref undefined.
        const node = catalog.nodes[idx];
        if (node === undefined) {
          fades.delete(idx);
          continue;
        }

        // Rebase the node's box origin into the camera-relative f64 frame before
        // the renderer narrows to f32 (parallel to the draw arrays).
        const seam = starNodeOriginRelCamMpc(catalog, node, camPos);
        nodeDraws.push({ nodeIndex: idx, firstRecord: node.firstRecord, recordCount: node.recordCount });
        originRelCamMpc.push(seam.originRelCamMpc);
        cellScaleMpc.push(seam.cellScaleMpc);
        // The leaf-vs-aggregate discriminant the flux-glow vertex stage needs:
        // 0 = a childless leaf (point-source stars), 1 = a box-filling aggregate.
        // Keyed on `childMask`, NOT `level`: a fat leaf lives at level > 0 yet is
        // a leaf whose records are real stars (see `buildStarOctree`).
        isAggregate.push(node.childMask === 0 ? 0 : 1);
        // Flux-reconstruction multiplier: a leaf record is one real star (1),
        // an aggregate record stands in for its whole subtree (its star count).
        subtreeStarCount.push(node.childMask === 0 ? 1 : counts[idx]!);
        // Per-node draw opacity = the source crossfade times this node's LOD fade.
        opacity.push(sourceCrossfade * f.opacity);
      }
      if (nodeDraws.length === 0) continue; // empty catalog / nothing left fading

      renderer.draw(pass, {
        source,
        vp: rebasedVp,
        viewportPx: view.viewportPx,
        nodeDraws,
        originRelCamMpc,
        cellScaleMpc,
        isAggregate,
        subtreeStarCount,
        opacity,
        sizePx,
        brightness,
        glowOverlap,
      });
    }

    // Render-on-demand wake: a mid-ramp LOD fade needs another frame to keep
    // advancing, or it freezes until the next input. Reuses the same
    // `scheduler.requestRender` hook `foregroundLabelsLayer` (caption envelope)
    // and the label director use for their own fades — no new wake channel.
    if (anyNodeFading) state.subsystems.scheduler.requestRender();
  },
};
