import type { Vec4 } from '../../../@types/math/Vec4';
import type { SCALE_FADE_BANDS } from '../../../data/scaleFadeBands';

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
  /**
   * Camera-distance band (from the render origin) over which this category's
   * rings, halos and labels are visible; multiplies every alpha they carry.
   */
  readonly visibleBand: (typeof SCALE_FADE_BANDS)[keyof typeof SCALE_FADE_BANDS];
  /** Drop-shadow outline (straight RGBA — renderer premultiplies). */
  readonly outlineColor: Vec4;
  /** Outline width as em-fraction. Capped at ~0.28 by atlas padding. */
  readonly outlineEmFrac: number;
};
