/**
 * structurePoiStyles — per-category visual style table for the extended
 * structures (cluster / supercluster / void) rendered as ring/halo markers
 * and text labels.
 *
 * The per-`StructureCategory` marker styles travel with the structure
 * presentation producers (`produceStructureMarkers`, `produceStructureLabels`);
 * famous-galaxy styling lives in `famousLabelStyle`. Keeping the structure
 * styles here lets the producers' per-category math read a single local table
 * rather than a wider union that includes a kind they never emit.
 *
 * `StructureCategory` (cluster | supercluster | void) is the discriminant;
 * every row is keyed by it so the table and the type can't drift.
 */

import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
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
 * Per-category visual style table. Rows are copied verbatim from the former
 * `POI_STYLES` cluster/supercluster/void entries — see the field docs above
 * for semantics and the tuning rationale (e.g. the per-category min-apparent
 * floors that keep the bulk catalog from papering the sky with sub-readable
 * specks).
 */
export const STRUCTURE_POI_STYLES = {
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
    labelColor: hexToGl('#FFCC80'),
    minPixelSize: 35,
    maxPixelSize: 150,
    worldEmMpc: 5.0,
    pixelWidth: 2,
    haloColor: hexToGl('#996B3666'),
    ringColor: hexToGl('#996B3666'),
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
} as const satisfies Readonly<Record<StructureCategory, StructureMarkerStyle>>;

/**
 * Alpha floor for significance weighting. Halo + ring alpha lerps from
 * `SIG_MIN_ALPHA × distanceFade` (significance 0) to the full `distanceFade`
 * (significance 1) — low-significance bulk clusters stay dim but visible.
 */
export const SIG_MIN_ALPHA = 0.25;

/**
 * Alpha scale applied to every NON-focused marker while some structure is
 * focused (cluster-focus mode), dimming the field so the focused ring reads.
 */
export const NON_SELECTED_MARKER_DIM = 0.25;
