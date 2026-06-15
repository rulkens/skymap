/**
 * structureMarkerStyles — per-category visual style table for the extended
 * structures (cluster / supercluster / void / group) rendered as ring/halo
 * markers and text labels.
 *
 * The per-`StructureId` marker styles travel with the structure
 * presentation producers (`produceStructureMarkers`, `produceStructureLabels`);
 * famous-galaxy styling lives in `famousLabelStyle`. Keeping the structure
 * styles here lets the producers' per-category math read a single local table
 * rather than a wider union that includes a kind they never emit.
 *
 * `StructureId` (cluster | supercluster | void | group) is the
 * discriminant; every row is keyed by it so the table and the type can't
 * drift.
 */

import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { Vec4 } from '../../../@types/math/Vec4';
import { hexToGl } from '../../../utils/color/hexToGl';

/**
 * Marker + label style fields for one structure category. Structures always
 * set a halo tint (famous galaxies — which opted out of the halo with a null
 * tint — live in `famousLabelStyle.ts`), so `haloColor` is a plain `Vec4`.
 */
export type StructureMarkerStyle = {
  /** Label glyph fill. */
  readonly labelColor: Vec4;
  /** Floor clamp on projected em height in screen pixels. */
  readonly minPixelSize: number;
  /** Ceiling clamp on projected em height in screen pixels. */
  readonly maxPixelSize: number;
  /** Label world-space em height in Mpc. */
  readonly worldEmMpc: number;
  /** Anchor-line / label stroke width in pixels. */
  readonly pixelWidth: number;
  /**
   * RGBA halo tint for the marker pass. Alpha is the AT-REST opacity —
   * per-frame fade multiplies into it.
   */
  readonly haloColor: Vec4;
  /** RGBA ring tint; same at-rest-alpha semantics as `haloColor`. */
  readonly ringColor: Vec4;
  /** Apparent on-screen radius (px) above which the marker fades OUT. */
  readonly markerMaxApparentRadiusPx: number;
  /** Smoothstep band width for the close-approach fade-out. */
  readonly markerMaxApparentFadeBandPx: number;
  /** Apparent on-screen radius (px) below which the marker fades OUT. */
  readonly markerMinApparentRadiusPx: number;
  /** Smoothstep band width for the far-distance fade-out. */
  readonly markerMinApparentFadeBandPx: number;
  /** Drop-shadow outline (straight RGBA — renderer premultiplies). */
  readonly outlineColor: Vec4;
  /** Outline width as em-fraction. Capped at ~0.28 by atlas padding. */
  readonly outlineEmFrac: number;
};

/**
 * Per-category visual style table: cluster / supercluster / void / group
 * (the Local Volume galaxy groups, 0–13 Mpc). See the field docs above for
 * semantics and the tuning rationale (e.g. the per-category min-apparent
 * floors that keep the bulk catalog from papering the sky with sub-readable
 * specks).
 */
export const STRUCTURE_MARKER_STYLES = {
  cluster: {
    labelColor: hexToGl('#FFD966'),
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 1.25,
    pixelWidth: 2,
    haloColor: hexToGl('#B39947'),
    ringColor: hexToGl('#B39947'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    markerMinApparentRadiusPx: 5,
    markerMinApparentFadeBandPx: 4,
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
  },
  supercluster: {
    // Orange end of the warm ramp — saturated enough to read clearly
    // distinct from the cluster yellow, with group holding the pale end.
    labelColor: hexToGl('#FFB86B'),
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 5.0,
    pixelWidth: 2,
    haloColor: hexToGl('#A05F2E66'),
    ringColor: hexToGl('#A05F2E66'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    markerMinApparentRadiusPx: 28,
    markerMinApparentFadeBandPx: 20,
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
  },
  void: {
    labelColor: hexToGl('#99D9F2'),
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 2.5,
    pixelWidth: 2,
    haloColor: hexToGl('#73B3D9A5'),
    ringColor: hexToGl('#73B3D9'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    markerMinApparentRadiusPx: 28,
    markerMinApparentFadeBandPx: 20,
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
  },
  group: {
    // Pale end of the warm scale-ladder ramp: group (soft cream) → cluster
    // (yellow, #FFD966) → supercluster (orange, #FFB86B). Lightness falls and
    // hue warms as the structures grow. The cream is held a notch below pure
    // white so the nearest, smallest rung doesn't out-shout the larger ones —
    // groups are a Local Volume detail, not the headline. Void stays cyan, the
    // odd one out representing absence rather than a scale rung.
    // Dim + translucent so the 16 near-volume groups sit quietly under the
    // brighter cluster/SC family instead of collectively dominating the Local
    // Volume. Lower luminance AND alpha on all three (label / ring / halo).
    labelColor: hexToGl('#C2B488C8'),
    minPixelSize: 35,
    maxPixelSize: 150,
    // Group labels are physically tiny — between famous-galaxy (0.0125) and
    // cluster (1.25).
    worldEmMpc: 0.3,
    pixelWidth: 2,
    // Muted pale-gold halo, much fainter than the ring so the near foreground
    // reads as a soft glow rather than a solid disk — important for the Local
    // Group at the origin, where the halo is largest.
    haloColor: hexToGl('#AB9C6E42'),
    ringColor: hexToGl('#AB9C6E9E'),
    markerMaxApparentRadiusPx: 700,
    markerMaxApparentFadeBandPx: 400,
    // High far-distance floor (well above the void/SC 28) so groups fade out
    // early with distance: they're a Local Volume feature meant to be read up
    // close, so once a group ring shrinks past ~44px it smoothsteps away rather
    // than lingering as a faint speck while you explore larger scales.
    markerMinApparentRadiusPx: 44,
    markerMinApparentFadeBandPx: 24,
    outlineColor: [0, 0, 0, 0.1],
    outlineEmFrac: 0.16,
  },
} as const satisfies Readonly<Record<StructureId, StructureMarkerStyle>>;

/**
 * Alpha floor for significance weighting. Halo + ring alpha lerps from
 * `SIG_MIN_ALPHA × distanceFade` (significance 0) to the full `distanceFade`
 * (significance 1) — low-significance bulk clusters stay dim but visible.
 */
export const SIG_MIN_ALPHA = 0.25;
