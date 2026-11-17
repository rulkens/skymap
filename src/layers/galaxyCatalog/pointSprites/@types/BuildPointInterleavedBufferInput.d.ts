import type { GalaxyCatalog } from '../../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { GalaxyPointStats } from './GalaxyPointStats';

export type BuildPointInterleavedBufferInput = {
  /** The galaxy catalog to bake.  Travels by structured clone (see module doc). */
  cloud: GalaxyCatalog;
  /** Which galaxy catalog this catalog belongs to — drives the colour-index K-correction. */
  source: GalaxyCatalogId;
  /** The record source's per-catalog stats, so the bake never recomputes them. */
  stats: GalaxyPointStats;
};
