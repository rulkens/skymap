import type { Vec4 } from '../../../../../packages/shared/src/@types/math/Vec4';

/** Ring and halo style for one structure category; its label's style is its `LABEL_STYLES` row. */
export type StructureMarkerStyle = {
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
  /** Apparent on-screen radius (CSS px, × dpr) below which the marker fades OUT. */
  readonly markerMinApparentRadiusPx: number;
  /** Smoothstep band width (CSS px, × dpr) for the far-distance fade-out. */
  readonly markerMinApparentFadeBandPx: number;
};
