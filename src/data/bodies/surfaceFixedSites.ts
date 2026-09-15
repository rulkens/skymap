/**
 * SURFACE_FIXED_SITES — the authored landing sites: a body, its host, and where
 * on that host it sits. A rover row is where it TOUCHED DOWN, not where it
 * stopped — Curiosity has since driven ~35 km up Mount Sharp and Opportunity
 * ~45 km to Perseverance Valley; the fact sheets say so. Heights are measured
 * from the host's mean sphere, so areoid- and selenoid-relative elevations are
 * not modelled.
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
  // Tranquility Base, Mare Tranquillitatis — the only site here that is not on
  // Mars, and the only one whose vehicle never moved.
  {
    id: 'apollo11',
    hostId: 'moon',
    latDeg: 0.67416,
    lonDeg: 23.47314,
    altitudeM: groundOffsetM('lunar-module'),
  },
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
