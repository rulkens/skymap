/**
 * structureMarkerStyles — per-category ring/halo style table, keyed by `StructureId` so the table
 * and the type can't drift. A category's label style is its row in `LABEL_STYLES`
 * (`STRUCTURE_LABEL_STYLES` names it).
 */

import type { StructureId } from '../../../../@types/data/structure/StructureId';
import type { StructureMarkerStyle } from '../@types/StructureMarkerStyle';
import { hexToGl } from '../../../../utils/color/hexToGl';

/**
 * The fields the four Milky Way rows share; each row adds its colours. The cosmic rows differ
 * field by field, so they stay spelled out.
 */
const MILKY_WAY_STYLE: Omit<StructureMarkerStyle, 'haloColor' | 'ringColor'> = {
  markerMaxApparentRadiusPx: 700,
  markerMaxApparentFadeBandPx: 400,
  markerMinApparentRadiusPx: 2.5,
  markerMinApparentFadeBandPx: 2,
};

/**
 * Per-category visual style table. See the field docs above for semantics and
 * the tuning rationale (e.g. the per-category min-apparent floors that keep the
 * bulk catalog from papering the sky with sub-readable specks).
 */
export const STRUCTURE_MARKER_STYLES = {
  'galaxy-cluster': {
    haloColor: hexToGl('#B39947'),
    ringColor: hexToGl('#B39947'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    markerMinApparentRadiusPx: 2.5,
    markerMinApparentFadeBandPx: 2,
  },
  supercluster: {
    // Orange end of the warm ramp — saturated enough to read clearly
    // distinct from the cluster yellow, with group holding the pale end.
    haloColor: hexToGl('#A05F2E66'),
    ringColor: hexToGl('#A05F2E66'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    markerMinApparentRadiusPx: 14,
    markerMinApparentFadeBandPx: 10,
  },
  void: {
    haloColor: hexToGl('#73B3D9A5'),
    ringColor: hexToGl('#73B3D9'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    markerMinApparentRadiusPx: 14,
    markerMinApparentFadeBandPx: 10,
  },
  'galaxy-group': {
    // Pale end of the warm scale-ladder ramp: group (soft cream) → cluster
    // (yellow, #FFD966) → supercluster (orange, #FFB86B). Lightness falls and
    // hue warms as the structures grow. The cream is held a notch below pure
    // white so the nearest, smallest rung doesn't out-shout the larger ones —
    // groups are a Local Volume detail, not the headline. Void stays cyan, the
    // odd one out representing absence rather than a scale rung.
    // Dim + translucent so the 16 near-volume groups sit quietly under the
    // brighter cluster/SC family instead of collectively dominating the Local
    // Volume. Lower luminance AND alpha on ring and halo (and the label's row).
    // Muted pale-gold halo, much fainter than the ring so the near foreground
    // reads as a soft glow rather than a solid disk — important for the Local
    // Group at the origin, where the halo is largest.
    haloColor: hexToGl('#AB9C6E42'),
    ringColor: hexToGl('#AB9C6E9E'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    // High far-distance floor (well above the void/SC 14) so groups fade out
    // early with distance: they're a Local Volume feature meant to be read up
    // close, so once a group ring shrinks past ~22 CSS px it smoothsteps away rather
    // than lingering as a faint speck while you explore larger scales.
    markerMinApparentRadiusPx: 22,
    markerMinApparentFadeBandPx: 12,
  },
  'open-cluster': {
    ...MILKY_WAY_STYLE,
    haloColor: hexToGl('#7B8AAD38'),
    ringColor: hexToGl('#7B8AAD'),
  },
  'globular-cluster': {
    ...MILKY_WAY_STYLE,
    haloColor: hexToGl('#9A7FD942'),
    ringColor: hexToGl('#9A7FD9'),
  },
  nebula: {
    ...MILKY_WAY_STYLE,
    haloColor: hexToGl('#D96F8442'),
    ringColor: hexToGl('#D96F84'),
  },
  'gc-cluster': {
    ...MILKY_WAY_STYLE,
    haloColor: hexToGl('#B8B8C842'),
    ringColor: hexToGl('#B8B8C8'),
  },
} as const satisfies Readonly<Record<StructureId, StructureMarkerStyle>>;

/**
 * Alpha floor for significance weighting. Halo + ring alpha lerps from
 * `SIG_MIN_ALPHA × distanceFade` (significance 0) to the full `distanceFade`
 * (significance 1) — low-significance bulk clusters stay dim but visible.
 */
export const SIG_MIN_ALPHA = 0.25;

/**
 * Colour gain on the selected structure's ring. A gain on colour, not alpha:
 * most rings rest at full opacity, where an alpha boost has nowhere to go, and
 * the HDR target has the headroom to show a colour above 1.
 */
export const SELECTED_RING_BRIGHTEN = 1.6;

/** A ring takes clicks only at or above this drawn alpha, so a nearly faded-out ring does not block the stars inside it. */
export const RING_PICK_MIN_ALPHA = 0.1;

/** The hover gain on a structure ring: a softer cue than the selected one, which outranks it. */
export const HOVERED_RING_BRIGHTEN = 1.3;
