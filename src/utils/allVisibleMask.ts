/**
 * Startup visibility mask — `1` for every galaxy catalog source whose
 * registry entry has `visible: true`. Structure codes never participate
 * (their bits stay clear). Drives the engine's initial
 * `drawMask`/`pickMask`.
 *
 * The renderer represents source visibility as a 32-bit integer mask
 * rather than a `Set`: it asks "is source X currently visible?" for every
 * point, every frame, and a bitmask answers in one `AND` + compare with
 * no allocation — workable both in the render loop and inside a WGSL
 * shader. See `maskHas` / `maskWith` / `maskWithout` for the operations.
 */

import { SOURCE_REGISTRY, GALAXY_CATALOG_SOURCES } from '../data/sources';

export const ALL_VISIBLE_MASK: number = GALAXY_CATALOG_SOURCES.reduce<number>(
  (mask, src) => (SOURCE_REGISTRY[src].visible ? mask | (1 << src) : mask),
  0,
);
