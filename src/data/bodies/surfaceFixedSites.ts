/**
 * SURFACE_FIXED_SITES — the authored landing sites: a body, its host, and where
 * on that host it sits. The four rows are where each rover TOUCHED DOWN, not
 * where it stopped — Curiosity has since driven ~35 km up Mount Sharp and
 * Opportunity ~45 km to Perseverance Valley; the fact sheets say so. Heights
 * are measured from Mars's mean 3390 km sphere, so areoid-relative site
 * elevations are not modelled.
 */

import { MESH_ASSETS } from './meshAssets.generated';
import type { SurfaceFixedSite } from '../../@types/scene/SurfaceFixedSite';

// The bake decides where a mesh's origin sits relative to its wheels, so the
// lift is READ from the generated table rather than eyeballed — a re-bake that
// moves the origin must move the rover with it, or it sinks or floats.
function groundOffsetM(meshKey: string): number {
  const asset = MESH_ASSETS[meshKey];
  if (!asset) throw new Error(`surfaceFixedSites: no MESH_ASSETS entry for meshKey '${meshKey}'`);
  return asset.groundOffsetM;
}

export const SURFACE_FIXED_SITES: readonly SurfaceFixedSite[] = [
  // Bradbury Landing, Gale crater.
  {
    id: 'curiosity',
    hostId: 'mars',
    latDeg: -4.5895,
    lonDeg: 137.4417,
    altitudeM: groundOffsetM('curiosity'),
  },
  // Octavia E. Butler Landing, Jezero crater.
  {
    id: 'perseverance',
    hostId: 'mars',
    latDeg: 18.4447,
    lonDeg: 77.4508,
    altitudeM: groundOffsetM('perseverance'),
  },
  // Columbia Memorial Station, Gusev crater.
  {
    id: 'spirit',
    hostId: 'mars',
    latDeg: -14.5684,
    lonDeg: 175.4726,
    altitudeM: groundOffsetM('mer'),
  },
  // Challenger Memorial Station, Meridiani Planum.
  {
    id: 'opportunity',
    hostId: 'mars',
    latDeg: -1.9462,
    lonDeg: 354.4734,
    altitudeM: groundOffsetM('mer'),
  },
];
