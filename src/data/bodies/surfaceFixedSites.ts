/**
 * SURFACE_FIXED_SITES — the authored rover sites: a body, its host, and where
 * on that host it sits. Curiosity and Spirit sit where they TOUCHED DOWN;
 * Opportunity and Perseverance sit where the HiRISE site bands can show them
 * (the Mars terrain bake clips each band to a window around these rows).
 * Heights are measured from Mars's mean 3390 km sphere.
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
  // Sol 1980 end-of-drive (RMC 91_970, ~2026-09-14), Jezero crater:
  // mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json.
  {
    id: 'perseverance',
    hostId: 'mars',
    latDeg: 18.43687,
    lonDeg: 77.23205,
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
  // Final resting place, Perseverance Valley on Endeavour's rim: the centre
  // of HiRISE ESP_087985_1780 "Opportunity Rover Position" (uahirise.org). A
  // proxy — no official lat/lon fix is published.
  {
    id: 'opportunity',
    hostId: 'mars',
    latDeg: -2.336,
    lonDeg: 354.619,
    altitudeM: groundOffsetM('mer'),
  },
];
