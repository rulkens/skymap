/**
 * EngineGalaxyCatalogsHandle — galaxy catalog point-billboard appearance + label controls.
 *
 * Owns the shared per-galaxy-catalog visual knobs (size, brightness, fallback-orientation
 * indicator, real-only filter, depth fade) that flow into `points.wgsl`, plus the
 * per-galaxy-catalog text-label axis. A galaxy catalog bears a label only when its registry row
 * carries one (the famous-galaxy `galaxyNames` layer today); `setLabelEnabled`
 * writes the galaxy catalog's item row either way and fires the label fade for the
 * label-bearing galaxy catalogs, so the curated-atlas name toggle and the billboard knobs
 * live on one cohesive sub-handle.
 */

import type { GalaxyCatalogId } from '../data/GalaxyCatalogId';

export type EngineGalaxyCatalogsHandle = {
  /** Set the billboard pixel radius for all rendered points. */
  setSize: (sizePx: number) => void;
  /** Set the global brightness multiplier applied to every star. */
  setBrightness: (value: number) => void;
  /** Toggle the per-galaxy camera-distance depth fade. */
  setDepthFade: (enabled: boolean) => void;
  /** Toggle the magenta tint on galaxies whose orientation is fallback. */
  setHighlightFallback: (enabled: boolean) => void;
  /** Toggle "show only galaxies with real photometric orientation". */
  setRealOnly: (enabled: boolean) => void;
  /** Show/hide the text labels for a galaxy catalog (famous-galaxy names today). */
  setLabelEnabled(galaxyCatalog: GalaxyCatalogId, enabled: boolean): void;
};
