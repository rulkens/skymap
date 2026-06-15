/**
 * GalaxyTypeMags — subset of mag fields needed for galaxy classification.
 *
 * The galaxy-type dispatcher (`src/utils/math/galaxyType.ts`) only needs
 * the five magnitude slots; this narrow shape keeps callers (the engine,
 * the InfoCard builder) from having to pass a full `GalaxyCatalog` row.
 */

/** Subset of mag fields needed for galaxy classification. */
export type GalaxyTypeMags = {
  magU: number;
  magG: number;
  magR: number;
  magI: number;
  magZ: number;
};
