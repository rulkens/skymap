import type { CraterRimFit } from '../@types/CraterRimFit';
import type { EquirectGrid } from '../@types/EquirectGrid';
import { sampleEquirect } from './sampleEquirect';
import { clamp } from '../../../utils/textures/clamp';
import { median as medianOf } from '../../../utils/perf/median';

const AZIMUTHS = 48;
const RADII = 46;
/** Profiles run over this span of the gazetteer radius: the crest of a listed crater
 *  sits within ±45% of it (Tycho +4%, Kepler +12%). */
const SPAN = [0.55, 1.45] as const;
/** A crest further than this (in gazetteer radii) from the median is a neighbour's rim. */
const CREST_BAND = 0.18;
/** The floor: profile radii below 0.65 R, or a ring at 0.25 R, whichever is lower. */
const FLOOR_RING = 0.25;

/**
 * The crater's rim on a DEM in metres: 48 radial profiles, each profile's maximum (a
 * 1-2-1 smoothing along r first, so one noisy texel never wins) is its crest; the
 * rim is the mean crest clipped to the median's band. A crest at the search edge is
 * no crest, and stands in at the median.
 */
export function fitCraterRim(
  dem: EquirectGrid,
  latDeg: number,
  lonDeg: number,
  diameterKm: number,
  bodyRadiusKm: number,
): CraterRimFit {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const c = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const east = [-Math.sin(lon), Math.cos(lon), 0];
  const north = [
    c[1]! * east[2]! - c[2]! * east[1]!,
    c[2]! * east[0]! - c[0]! * east[2]!,
    c[0]! * east[1]! - c[1]! * east[0]!,
  ];
  const rho0 = diameterKm / 2 / bodyRadiusKm;
  const at = (az: number, r: number): number => {
    const dir = [0, 1, 2].map((k) => Math.cos(az) * east[k]! + Math.sin(az) * north[k]!);
    const a = r * rho0;
    const p = [0, 1, 2].map((k) => Math.cos(a) * c[k]! + Math.sin(a) * dir[k]!);
    return sampleEquirect(
      dem,
      Math.asin(Math.max(-1, Math.min(1, p[2]!))),
      Math.atan2(p[1]!, p[0]!),
    );
  };
  const rr = Array.from(
    { length: RADII },
    (_, i) => SPAN[0] + ((SPAN[1] - SPAN[0]) * i) / (RADII - 1),
  );
  const floorTaps = Math.floor(RADII * 0.12);

  const crest: number[] = [];
  const crestH: number[] = [];
  const edge: boolean[] = [];
  let innerSum = 0;
  let ringSum = 0;
  for (let i = 0; i < AZIMUTHS; i++) {
    const az = (2 * Math.PI * i) / AZIMUTHS;
    const h = rr.map((r) => at(az, r));
    const hs = h.map((v, k) =>
      k === 0 || k === RADII - 1 ? v : (h[k - 1]! + 2 * v + h[k + 1]!) / 4,
    );
    let k = 0;
    for (let j = 1; j < RADII; j++) if (hs[j]! > hs[k]!) k = j;
    crest.push(rr[k]!);
    crestH.push(hs[k]!);
    edge.push(k <= 1 || k >= RADII - 2);
    for (let j = 0; j < floorTaps; j++) innerSum += h[j]!;
    ringSum += at(az, FLOOR_RING);
  }

  const found = crest.filter((_, i) => !edge[i]);
  const median = found.length > AZIMUTHS / 3 ? medianOf(found) : 1;
  const radius =
    crest.reduce(
      (sum, r, i) => sum + clamp(edge[i] ? median : r, median - CREST_BAND, median + CREST_BAND),
      0,
    ) / AZIMUTHS;
  const rim = crestH.reduce((a, b) => a + b, 0) / AZIMUTHS;
  const floor = Math.min(innerSum / (AZIMUTHS * floorTaps), ringSum / AZIMUTHS);
  return {
    rhoRad: rho0 * radius,
    depthKm: (rim - floor) / 1000,
    confidence: found.length / AZIMUTHS,
  };
}
