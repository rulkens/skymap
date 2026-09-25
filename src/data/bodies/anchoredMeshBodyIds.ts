/**
 * ANCHORED_MESH_BODY_IDS — the mesh bodies whose `SURFACE_FIXED_SITES` row is
 * `anchored` (a georeferenced scan, i.e. ground rather than an object on it).
 * Site ids are body ids. Derived once so per-frame readers do a Set lookup.
 */

import { SURFACE_FIXED_SITES } from './surfaceFixedSites';

export const ANCHORED_MESH_BODY_IDS: ReadonlySet<string> = new Set(
  SURFACE_FIXED_SITES.filter((site) => site.seat === 'anchored').map((site) => site.id),
);
