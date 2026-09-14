/**
 * GalaxyCatalogSettings — shared appearance knobs for every galaxy catalog's
 * `points.wgsl` draw, plus per-catalog `items`. No cluster-level master gate:
 * "hide all galaxy catalogs" has never been a product control.
 */

import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from './GalaxyCatalogItemSettings';
import type { GalaxyProvenanceSettings } from './GalaxyProvenanceSettings';

export type GalaxyCatalogSettings = {
  sizePx: number;
  brightness: number;
  depthFade: boolean;
  /** Debug-panel audit per `PROVENANCE_AXES` axis; defaults to a shader no-op. */
  provenance: GalaxyProvenanceSettings;
  /** Physical-SB → HDR gain; rides the points uniform as `galaxySbScale`. */
  sbScale: number;
  /** Ceiling on a galaxy's baked SB amplitude, clamped live as `galaxySbMax`. */
  sbMax: number;
  /**
   * Exponent k in `pow(resolvedFrac, k)`, gated by `depthFade`: k = 2 is the
   * full physical inverse-square, lower k keeps the deep field visible. Uniform
   * `galaxyFalloffStrength`.
   */
  falloffStrength: number;
  /** Only the famous catalog draws a label; the rest carry `labelEnabled` inertly. */
  items: Record<GalaxyCatalogId, GalaxyCatalogItemSettings>;
};
