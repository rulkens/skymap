/**
 * produceStructureMarkers — per-frame ring/halo descriptors for the extended
 * structures (cluster / supercluster / void), read from `structureStore`.
 *
 * Reads `state.data.structures` and emits one cluster marker descriptor per
 * marker-bearing structure — applying apparent-size fades, significance
 * weighting, the selection bump, per-category opacity (the category toggle's
 * fade, read from the FadeRegistry), and a smooth focus *recession*. Famous
 * galaxies are not on this path; they never emit markers.
 *
 * Per-category opacity and recession bake into the DESCRIPTOR alpha rather
 * than riding a uniform: the marker renderer has a single global `fadeOpacity`
 * uniform that can't carry per-category or per-instance opacity, so the
 * producer is the only place the two can be applied independently per ring.
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
 * skip is all-or-nothing-per-category — a category that is both DISABLED (its
 * `structures.items[cat].enabled` boolean is false, the authoritative gate) AND
 * fully faded (toggle opacity exactly 0) — which never perturbs within-category
 * alignment. A still-fading category (disabled but opacity > 0) keeps emitting
 * alpha-scaled descriptors so the fade-out tail draws to completion.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { Vec4 } from '../../../@types/math/Vec4';
import type { StructureMarkerDescriptor } from '../../../@types/rendering/StructureMarkerDescriptor';
import {
  STRUCTURE_MARKER_STYLES,
  SIG_MIN_ALPHA,
  SELECTED_RING_BRIGHTEN,
} from './structureMarkerStyles';
import { focusRecession } from './focusRecession';
import { structureIdOf } from '../helpers/structureIdOf';
import { fadeBand } from '../../../utils/math/fadeBand';

export function produceStructureMarkers(
  state: PassState,
  ctx: FrameView,
): readonly StructureMarkerDescriptor[] {
  const out: StructureMarkerDescriptor[] = [];
  const pxPerRad = ctx.drawPxPerRad;
  const [cx, cy, cz] = ctx.drawCamPos;
  // Distance from the render origin, which keys each category's visibility band.
  const camDistMpc = Math.hypot(cx, cy, cz);

  // selected → 1.5× ring bump (highlight what you clicked); focused → the
  // "every OTHER ring recedes" mode (cluster-focus). A galaxy selection
  // leaves the matching id null, so no structure ring is bumped / recedes.
  const selectedStructureId = structureIdOf(state.selection.select);
  const focusedStructureId = structureIdOf(state.selection.focus);

  // Per-category marker opacity (the category toggle's fade) lives in the
  // FadeRegistry; unregistered handles fail-safe to 1.0. Snapshot the frame
  // clock once so every category reads the same instant.
  const fades = state.subsystems.fades;
  const now = ctx.snapshot.nowMs;

  // Clip-owned transient opacity for structure rings — hoisted outside the loop
  // because ALL structure sources map to the same `'structureRing'` key, so the
  // factor is identical for every structure. Returns 1 when no clip is playing.
  // We address the key directly (`'structureRing'`) since `fadeIdToVisibilityKey`
  // maps every `StructureId` to this value without discrimination.
  const clipFactor = state.subsystems.clipPlayer.clipOpacityOf('structureRing', now);

  const structures = state.data.structures;
  for (const p of structures.all()) {
    // Per-category marker opacity: the category toggle's fade, read from the
    // registry. The authoritative gate is the boolean — draw while the category
    // is enabled OR still fading out. Only when it's both disabled AND fully
    // faded do we skip (the all-or-nothing case, safe for within-category
    // alignment). A mid-fade value scales the descriptor alpha; catOpacity is
    // still multiplied into `weightedFade` below.
    const catOpacity = fades.opacityOf({ kind: 'structure', id: p.category }, now);
    const enabled = state.settings.structures.items[p.category].enabled;
    if (!enabled && catOpacity === 0) continue;
    // Render at the WIDER apparent extent, falling back to the core for
    // structures that only set physicalRadiusMpc.
    const radiusMpc = p.apparentRadiusMpc ?? p.physicalRadiusMpc;
    const style = STRUCTURE_MARKER_STYLES[p.category];
    const bandFade = fadeBand(style.visibleBand, camDistMpc);

    const dx = p.worldPos[0] - cx;
    const dy = p.worldPos[1] - cy;
    const dz = p.worldPos[2] - cz;
    const distanceMpc = Math.hypot(dx, dy, dz);

    // The apparent-size projection divides by distance, so an eye exactly on
    // the anchor gets alpha 0. Still emit a descriptor to keep the index
    // alignment — discarded in-fragment.
    let fadeAlpha: number;
    if (distanceMpc <= 0) {
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
    // clipFactor is the clip-player's transient opacity for the structureRing
    // key — 1 when no clip plays, otherwise the cue-driven dimming value.
    const weightedFade = fadeAlpha * sigWeight * catOpacity * clipFactor;

    // Cluster focus mode: while some structure is FOCUSED, every OTHER marker
    // smoothly recedes toward MARKER_RECESSION as ctx.snapshot.focusBlend ramps 0→1. The
    // focused structure is exempt (factor 1) — a faded ring never carries a
    // bright label/marker. A bare select does NOT recede. At rest (blend 0): 1.
    const isSelected = p.id === selectedStructureId;
    const recession =
      p.id === focusedStructureId
        ? 1
        : focusRecession({ kind: 'structure', id: p.category }, ctx.snapshot.focusBlend);

    // Halo: style at-rest alpha × per-frame fade × recession baked into alpha.
    const haloColor: Vec4 = [
      style.haloColor[0],
      style.haloColor[1],
      style.haloColor[2],
      style.haloColor[3] * weightedFade * recession * bandFade,
    ];

    // Ring: same fade bake plus selection. The selected ring is brightened and
    // recession-free; every other ring is scaled by the focus recession.
    const ringGain = isSelected ? SELECTED_RING_BRIGHTEN : 1;
    const ringColor: Vec4 = [
      style.ringColor[0] * ringGain,
      style.ringColor[1] * ringGain,
      style.ringColor[2] * ringGain,
      style.ringColor[3] * weightedFade * (isSelected ? 1 : recession) * bandFade,
    ];

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
