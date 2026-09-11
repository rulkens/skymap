/**
 * GalaxyCatalogSettings — shared appearance knobs for every galaxy catalog's
 * `points.wgsl` draw, plus per-galaxy-catalog `items`. Unlike `volumes` /
 * `starCatalogs` there is no cluster-level master gate: no product decision
 * has made "hide all galaxy catalogs" a control.
 */

import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from './GalaxyCatalogItemSettings';
import type { GalaxyProvenanceSettings } from './GalaxyProvenanceSettings';

export type GalaxyCatalogSettings = {
  sizePx: number;
  brightness: number;
  depthFade: boolean;
  /**
   * Data-quality audit state: per provenance axis (see `PROVENANCE_AXES`), a
   * highlight overlay and a tri-state cull. Debug-panel-only; every axis
   * defaults to "highlight off, show all", which the shader collapses to a
   * no-op.
   */
  provenance: GalaxyProvenanceSettings;
  /**
   * Overall physical-SB → HDR gain — multiplies each galaxy's baked
   * surface-brightness amplitude into the additive HDR field. The live
   * successor to the old hardcoded `GALAXY_SB_SCALE` shader const; rides the
   * points `Uniforms` struct as `galaxySbScale`. Default `DEFAULT_GALAXY_SB_SCALE`.
   */
  sbScale: number;
  /**
   * Bloom ceiling — the maximum baked surface-brightness amplitude a compact
   * galaxy can emit. The vertex stage clamps `sbAmp` to it live (`galaxySbMax`
   * uniform), replacing the old bake-time clamp (now only a float-safety
   * guard). Default `DEFAULT_GALAXY_SB_MAX`.
   */
  sbMax: number;
  /**
   * Readability-falloff exponent `k` on the resolved-fraction falloff
   * `pow(resolvedFrac, k)`, gated by `depthFade`. k = 2 is the full physical
   * inverse-square; lower k keeps the deep field visible. Rides the points
   * uniform as `galaxyFalloffStrength`. Default `DEFAULT_GALAXY_FALLOFF_STRENGTH`.
   */
  falloffStrength: number;
  /**
   * One row per `GalaxyCatalogId`: the layer-visibility axis (`enabled`) and
   * the text-label axis (`labelEnabled`). Only the famous-galaxy catalog
   * actually renders a label; the rest carry `labelEnabled` inertly so all
   * five source-type clusters share one per-item shape.
   */
  items: Record<GalaxyCatalogId, GalaxyCatalogItemSettings>;
};
