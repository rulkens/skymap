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
import type { StarCatalogSourceEntry } from '../../../../@types/data/starCatalog/StarCatalogSourceEntry';
import { NEAR0 } from '../slabs';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { walkStarOctreeCut } from '../../../gpu/renderers/starCatalog/walkStarOctreeCut';
import { starNodeOriginRelCamMpc } from '../../../gpu/renderers/starCatalog/starNodeOriginRelCamMpc';
import { SOURCE_REGISTRY } from '../../../../data/sources';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

// The star octree grid is parsec-based; the scene frame is Mpc. This is the
// inverse of PC_TO_MPC, kept a single source of truth off SCALE_UNITS.
const MPC_TO_PC = 1 / SCALE_UNITS.PC_TO_MPC;

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

    for (const { source, catalog } of renderer.loadedCatalogs()) {
      const entry = SOURCE_REGISTRY[source];
      if (entry.type !== 'starCatalog') continue;
      if (!state.settings.starCatalogs.items[entry.id].enabled) continue;

      const opacity = crossfadeOpacity(entry, camDistPc);
      if (opacity <= 0) continue; // faded out — additive draw of nothing

      // Walk this frame's cut, then rebase each chosen node's box origin into
      // the camera-relative f64 frame (parallel to the cut) before the renderer
      // narrows to f32.
      const nodeDraws = walkStarOctreeCut(catalog, camPosPc, entry.drawBudget);
      if (nodeDraws.length === 0) continue; // empty catalog / degenerate cut

      const originRelCamMpc: Vec3[] = [];
      const cellScaleMpc: number[] = [];
      for (const nodeDraw of nodeDraws) {
        const node = catalog.nodes[nodeDraw.nodeIndex]!;
        const seam = starNodeOriginRelCamMpc(catalog, node, camPos);
        originRelCamMpc.push(seam.originRelCamMpc);
        cellScaleMpc.push(seam.cellScaleMpc);
      }

      renderer.draw(pass, {
        source,
        vp: rebasedVp,
        viewportPx: view.viewportPx,
        nodeDraws,
        originRelCamMpc,
        cellScaleMpc,
        opacity,
      });
    }
  },
};
