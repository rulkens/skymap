import type { GalaxyCatalog } from '../data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../data/SourceType';

export type BuildPointInterleavedBufferInput = {
  /** The galaxy catalog to bake.  Travels by structured clone (see module doc). */
  cloud: GalaxyCatalog;
  /** Which galaxy catalog this catalog belongs to — drives the colour-index K-correction. */
  source: SourceType;
};
