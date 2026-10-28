/**
 * produceStructureMarkers — per-frame ring/halo descriptors for the extended
 * structures (every cosmic and Milky Way category), read from the Layer's
 * structure store.
 *
 * Emits one marker descriptor per marker-bearing structure — applying
 * apparent-size fades, significance weighting, the selection brighten, the
 * per-category value core hands (toggle fade, clip and distance band) and each ring's focus
 * emphasis, keyed on its own pick word so the focused ring never recedes. Famous
 * galaxies are not on this path; they never emit markers.
 *
 * The per-category value bakes into the DESCRIPTOR alpha rather than riding a
 * uniform: the marker renderer has a single global `fadeOpacity` uniform that
 * can't carry per-category opacity, so the producer is the only place it can
 * be applied independently per ring.
 *
 * ### Emit-all-then-discard contract (pick-index alignment)
 *
 * Every marker-bearing structure of a VISIBLE category emits EXACTLY ONE
 * descriptor, in `structureStore.all()` order (anchors → bulk) — INCLUDING
 * fully-faded ones, which emit alpha-0 colours the fragment discards. This
 * keeps each category's run index-aligned with `structureStore.byCategory(cat)`:
 * the ring pick path packs `@builtin(instance_index)` as the per-category-local
 * index and `resolveStructureFromPick` resolves it through `byCategory(cat)[structureIndex]`.
 * Omitting a faded structure would index-shift that lookup. The only legitimate
 * skip is all-or-nothing-per-category — a category whose handed value is exactly
 * 0 — which never perturbs within-category alignment. A still-fading category
 * (value above 0) keeps emitting alpha-scaled descriptors so the fade-out tail
 * draws to completion.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { Vec4 } from '../../../@types/math/Vec4';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { StructureMarkerDescriptor } from '../@types/StructureMarkerDescriptor';
import type { StructureStore } from '../@types/StructureStore';
import {
  STRUCTURE_MARKER_STYLES,
  SIG_MIN_ALPHA,
  SELECTED_RING_BRIGHTEN,
  HOVERED_RING_BRIGHTEN,
  RING_PICK_MIN_ALPHA,
} from './structureMarkerStyles';
import { structureApparentRadiusFade } from './structureApparentRadiusFade';
import { structureIdOf } from '../../../services/engine/helpers/structureIdOf';
import { isPickableUnderFocus } from '../../../utils/structure/isPickableUnderFocus';
import { structurePickId } from '../../../utils/picking/structurePickId';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { emphasisOf } from '../../../services/engine/presentation/emphasisOf';
import { structureVisibility } from '../visibility';

const RING_ENTRY = visibilityEntryOf(structureVisibility, 'structureRing');

export function produceStructureMarkers(
  store: Pick<StructureStore, 'all' | 'categoryIndexOf'>,
  state: PassState,
  ctx: FrameView,
  fade: Readonly<Record<StructureId, number>>,
): readonly StructureMarkerDescriptor[] {
  const out: StructureMarkerDescriptor[] = [];
  const pxPerRad = ctx.drawPxPerRad;
  const [cx, cy, cz] = ctx.drawCamPos;

  // selected → ring colour gain SELECTED_RING_BRIGHTEN (highlight what you clicked). A
  // galaxy selection leaves the matching id null, so no structure ring is bumped.
  const selectedStructureId = structureIdOf(state.selection.select);
  const hoveredStructureId = structureIdOf(state.selection.hover);

  for (const p of store.all()) {
    // The category's handed value: toggle fade × clip × distance band. Skip only at
    // exactly 0 (the all-or-nothing case, safe for within-category alignment); a
    // mid-fade value scales the descriptor alpha below.
    const catFade = fade[p.category];
    if (catFade === 0) continue;
    // Render at the WIDER apparent extent, falling back to the core for
    // structures that only set physicalRadiusMpc.
    const radiusMpc = p.apparentRadiusMpc ?? p.physicalRadiusMpc;
    const style = STRUCTURE_MARKER_STYLES[p.category];

    const dx = p.worldPos[0] - cx;
    const dy = p.worldPos[1] - cy;
    const dz = p.worldPos[2] - cz;
    const distanceMpc = Math.hypot(dx, dy, dz);

    // The apparent-size projection divides by distance, so an eye exactly on
    // the anchor gets alpha 0. Still emit a descriptor to keep the index
    // alignment — discarded in-fragment.
    const fadeAlpha =
      distanceMpc <= 0
        ? 0
        : structureApparentRadiusFade(style, (radiusMpc / distanceMpc) * pxPerRad);

    // Significance weighting on top of the distance fade: lerp from
    // SIG_MIN_ALPHA (significance 0) to 1 (significance 1). Featured anchors
    // omit significance, so `?? 1` leaves their at-rest alpha unchanged.
    const sigWeight = SIG_MIN_ALPHA + (1 - SIG_MIN_ALPHA) * (p.significance ?? 1);
    const pickId = structurePickId(p.category, store.categoryIndexOf(p.category, p.id));
    const weightedFade =
      fadeAlpha * sigWeight * catFade * emphasisOf(RING_ENTRY, ctx.snapshot, pickId);

    // Halo: style at-rest alpha × per-frame fade baked into alpha.
    const haloColor: Vec4 = [
      style.haloColor[0],
      style.haloColor[1],
      style.haloColor[2],
      style.haloColor[3] * weightedFade,
    ];

    // Ring: same fade bake plus selection/hover brighten.
    const isSelected = p.id === selectedStructureId;
    let ringGain = 1;
    if (p.id === hoveredStructureId) ringGain = HOVERED_RING_BRIGHTEN;
    if (isSelected) ringGain = SELECTED_RING_BRIGHTEN;
    const ringColor: Vec4 = [
      style.ringColor[0] * ringGain,
      style.ringColor[1] * ringGain,
      style.ringColor[2] * ringGain,
      style.ringColor[3] * weightedFade,
    ];

    out.push({
      id: p.id,
      category: p.category,
      worldPos: [p.worldPos[0], p.worldPos[1], p.worldPos[2]],
      radiusMpc,
      haloColor,
      ringColor,
      pickable:
        ringColor[3] >= RING_PICK_MIN_ALPHA && isPickableUnderFocus(p.worldPos, ctx.snapshot.focus),
    });
  }
  return out;
}
