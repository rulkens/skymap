import { median } from '../../utils/perf/median';
import type { GalstreamsTrack } from '../@types/GalstreamsTrack';
import { TRACK_DEFAULT_WIDTH_DEG, TRACK_MIN_WIDTH_KPC } from '../data/streamsBuild.constants';

/** The stream's angular width at its median distance, kpc, floored so a thin track stays visible. */
export function trackWidthKpc(track: GalstreamsTrack): number {
  const widthRad = ((track.widthDeg ?? TRACK_DEFAULT_WIDTH_DEG) * Math.PI) / 180;
  return Math.max(TRACK_MIN_WIDTH_KPC, widthRad * median(track.distanceKpc));
}
