/**
 * produceStructureMarkers — per-frame ring/halo descriptors for the extended
 * structures (cluster / supercluster / void), read from `structureStore`.
 *
 * Reads `state.data.structures` and emits one cluster marker descriptor per
 * marker-bearing structure — applying apparent-size fades, significance
 * weighting, the selection bump, and the focus dim. Famous galaxies are not on
 * this path; they never emit markers.
 *
 * ### Emit-all-then-discard contract (pick-index alignment)
 *
 * Every marker-bearing structure of a VISIBLE category emits EXACTLY ONE
 * descriptor, in `structureStore.all()` order (anchors → bulk) — INCLUDING
 * fully-faded ones, which emit alpha-0 colours the fragment discards. This
 * keeps each category's run index-aligned with `structureStore.byCategory(cat)`:
 * the ring pick path packs `@builtin(instance_index)` as the per-category-local
 * index and `resolvePoiFromPick` resolves it through `byCategory(cat)[poiIndex]`.
 * Omitting a faded structure would index-shift that lookup. The only legitimate
 * skip is all-or-nothing-per-category (visibility), which never perturbs
 * within-category alignment.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Vec4 } from '../../../@types/math/Vec4';
import type { ClusterMarkerDescriptor } from '../../../@types/rendering/ClusterMarkerDescriptor';
import { STRUCTURE_POI_STYLES, SIG_MIN_ALPHA, NON_SELECTED_MARKER_DIM } from './structurePoiStyles';

export function produceStructureMarkers(
  state: EngineState,
  ctx: ReadyFrameContext,
): readonly ClusterMarkerDescriptor[] {
  const out: ClusterMarkerDescriptor[] = [];
  const halfH = ctx.canvasSize.height * 0.5;
  const fovYRad = 2 * Math.atan(halfH / ctx.drawPxPerRad);
  const pxPerRad = (ctx.canvasSize.height * 0.5) / Math.tan(fovYRad * 0.5);
  const [cx, cy, cz] = ctx.drawCamPos;

  // selected → 1.5× ring bump (highlight what you clicked); focused → the
  // "every OTHER ring recedes" dim (cluster-focus mode). A galaxy selection
  // leaves the matching id null, so no structure ring is bumped / dimmed.
  const sel = state.subsystems.selection.selected();
  const selectedPoiId = sel !== null && sel.kind === 'poi' ? sel.id : null;
  const foc = state.subsystems.selection.focused();
  const focusedPoiId = foc !== null && foc.kind === 'poi' ? foc.id : null;

  const structures = state.data.structures;
  for (const p of structures.all()) {
    // Marker-axis gate only (independent of label visibility). All-or-nothing
    // per category, so this skip is safe for within-category alignment.
    if (!structures.markerVisible(p.category)) continue;
    // Render at the WIDER apparent extent, falling back to the core for
    // structures that only set physicalRadiusMpc.
    const radiusMpc = p.apparentRadiusMpc ?? p.physicalRadiusMpc;
    const style = STRUCTURE_POI_STYLES[p.category];

    const dx = p.worldPos[0] - cx;
    const dy = p.worldPos[1] - cy;
    const dz = p.worldPos[2] - cz;
    const distanceMpc = Math.hypot(dx, dy, dz);

    // Camera on top of the structure: projection divides by distance, so treat
    // as fully faded. Still emit a descriptor (alpha 0) to keep the index
    // alignment — discarded in-fragment.
    let fadeAlpha: number;
    if (distanceMpc < 0.001) {
      fadeAlpha = 0;
    } else {
      const apparentRadiusPx = (radiusMpc / distanceMpc) * pxPerRad;

      // Close-approach fade-out: smoothstep 1 → 0 as the ring grows past
      // markerMaxApparentRadiusPx.
      let maxFadeAlpha = 1;
      if (apparentRadiusPx > style.markerMaxApparentRadiusPx) {
        const t = Math.min(
          1,
          (apparentRadiusPx - style.markerMaxApparentRadiusPx) / style.markerMaxApparentFadeBandPx,
        );
        maxFadeAlpha = 1 - t * t * (3 - 2 * t);
      }

      // Far-distance fade-out: smoothstep 0 → 1 across the band below
      // markerMinApparentRadiusPx so rings don't pop as the camera pulls back.
      let minFadeAlpha: number;
      if (apparentRadiusPx < style.markerMinApparentRadiusPx) {
        minFadeAlpha = 0;
      } else if (
        apparentRadiusPx <
        style.markerMinApparentRadiusPx + style.markerMinApparentFadeBandPx
      ) {
        const t =
          (apparentRadiusPx - style.markerMinApparentRadiusPx) / style.markerMinApparentFadeBandPx;
        minFadeAlpha = t * t * (3 - 2 * t);
      } else {
        minFadeAlpha = 1;
      }

      fadeAlpha = Math.min(maxFadeAlpha, minFadeAlpha);
    }

    // Significance weighting on top of the distance fade: lerp from
    // SIG_MIN_ALPHA (significance 0) to 1 (significance 1). Featured anchors
    // omit significance, so `?? 1` leaves their at-rest alpha unchanged.
    const sigWeight = SIG_MIN_ALPHA + (1 - SIG_MIN_ALPHA) * (p.significance ?? 1);
    const weightedFade = fadeAlpha * sigWeight;

    // Cluster focus mode: while some structure is FOCUSED, every OTHER marker
    // dims to NON_SELECTED_MARKER_DIM. A bare select does NOT dim. At rest: 1.
    const isSelected = p.id === selectedPoiId;
    const dim = focusedPoiId !== null && p.id !== focusedPoiId ? NON_SELECTED_MARKER_DIM : 1;

    // Halo: style at-rest alpha × per-frame fade × focus dim baked into alpha.
    const haloColor: Vec4 = [
      style.haloColor[0],
      style.haloColor[1],
      style.haloColor[2],
      style.haloColor[3] * weightedFade * dim,
    ];

    // Ring: same fade bake plus selection. Selected ring ×1.5 (capped at 1);
    // every other ring scaled by the focus dim.
    const ringAlphaBase = style.ringColor[3] * weightedFade;
    const ringAlpha = isSelected ? Math.min(1, ringAlphaBase * 1.5) : ringAlphaBase * dim;
    const ringColor: Vec4 = [style.ringColor[0], style.ringColor[1], style.ringColor[2], ringAlpha];

    out.push({
      id: p.id,
      category: p.category,
      worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
      radiusMpc,
      haloColor,
      ringColor,
    });
  }
  return out;
}
