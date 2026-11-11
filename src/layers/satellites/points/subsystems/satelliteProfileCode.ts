/**
 * satelliteProfileCode — which `SATELLITE_PROFILES` row a catalog object gets, decided once at
 * catalog load. First match wins: debris, rocket bodies, named constellations, then orbit regime.
 * Names match by whole token so `DEBUT-1` is not debris. Blank or odd input falls through to a
 * regime row rather than throwing.
 */
import { EARTH_GM_KM3_S2 } from '../../../../data/earthGmKm3S2';
import { SATELLITE_CLASSES } from '../../../../data/satellites/satelliteClasses';
import { SATELLITE_PROFILES } from '../data/satelliteProfiles';
import type { SatelliteProfileId } from '../@types/SatelliteProfileId';
import type { SatelliteProfileInput } from '../@types/SatelliteProfileInput';

const EARTH_RADIUS_KM = 6378;
const SIDEREAL_REV_PER_DAY = 1.0027;
// Starlink V2 Mini launches begin at 2023-026.
const V2_MINI_YEAR = 2023;
const V2_MINI_LAUNCH = 26;

function launchBeforeV2Mini(cosparId: string): boolean {
  const m = /^(\d{4})-(\d{3})/.exec(cosparId);
  if (m === null) return false;
  const year = Number(m[1]);
  return year < V2_MINI_YEAR || (year === V2_MINI_YEAR && Number(m[2]) < V2_MINI_LAUNCH);
}

function regime(meanMotion: number, e: number): SatelliteProfileId {
  const n = (meanMotion * 2 * Math.PI) / 86400;
  const a = Math.cbrt(EARTH_GM_KM3_S2 / (n * n));
  const apogee = a * (1 + e) - EARTH_RADIUS_KM;
  const perigee = a * (1 - e) - EARTH_RADIUS_KM;
  if (Math.abs(meanMotion - SIDEREAL_REV_PER_DAY) < 0.05 && e < 0.05) return 'geo';
  if (apogee < 2000) return 'leo';
  if (perigee > 2000 && apogee < 35000 && e < 0.3) return 'meo';
  return 'heo';
}

function profileId(input: SatelliteProfileInput): SatelliteProfileId {
  const name = input.name.toUpperCase();
  const tokens = name.split(/[\s(),]+/);
  const cls = SATELLITE_CLASSES[input.classCode];
  if (cls === 'debris' || tokens.includes('DEB')) return 'debris';
  if (cls === 'other' || tokens.includes('R/B')) return 'other';
  if (name.startsWith('STARLINK')) {
    return launchBeforeV2Mini(input.cosparId) ? 'starlink-v1' : 'starlink-v2-mini';
  }
  if (name.startsWith('ONEWEB')) return 'oneweb';
  if (name.startsWith('KUIPER')) return 'kuiper';
  if (name.startsWith('QIANFAN')) return 'qianfan';
  if (name.startsWith('HULIANWANG') || name.startsWith('GUOWANG')) return 'guowang';
  return regime(input.meanMotion, input.eccentricity);
}

export function satelliteProfileCode(input: SatelliteProfileInput): number {
  const id = profileId(input);
  return SATELLITE_PROFILES.findIndex((p) => p.id === id);
}
