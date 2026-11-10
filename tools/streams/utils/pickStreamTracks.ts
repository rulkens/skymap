import type { GalstreamsTrack } from '../@types/GalstreamsTrack';

/** galstreams marks a sky-only track by giving every point this placeholder distance. */
const SKY_ONLY_DISTANCE_KPC = 1;
/** Sagittarius comes from the N-body model; galstreams only has its Gaia-local arc. */
const NBODY_STREAM = 'Sagittarius';

/** One stream track per stream: its master-log `On` track when that one is usable, else the first. */
export function pickStreamTracks(tracks: readonly GalstreamsTrack[]): GalstreamsTrack[] {
  const byName = new Map<string, GalstreamsTrack[]>();
  for (const t of tracks) {
    if (t.kind !== 'st' || t.name === NBODY_STREAM) continue;
    if (t.distanceKpc.every((d) => Math.abs(d - SKY_ONLY_DISTANCE_KPC) < 1e-6)) continue;
    byName.set(t.name, [...(byName.get(t.name) ?? []), t]);
  }
  return [...byName.values()].map((ts) => ts.find((t) => t.on) ?? ts[0]!);
}
