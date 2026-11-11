import type { GalstreamsTrack } from '../../../tools/streams/@types/GalstreamsTrack';

/** An equatorial arc of `points` points from RA 0 to `spanDeg` at a fixed distance, moving at +pmRa. */
export function galstreamsTrackFixture(
  over: Partial<GalstreamsTrack> & { spanDeg?: number; points?: number } = {},
): GalstreamsTrack {
  const { spanDeg = 60, points = 61, ...rest } = over;
  const n = Array.from({ length: points }, (_, i) => i);
  return {
    kind: 'st',
    on: true,
    name: 'GD-1',
    ref: 'ref2020',
    widthDeg: null,
    ra: n.map((i) => (spanDeg * i) / (points - 1)),
    dec: n.map(() => 0),
    distanceKpc: n.map(() => 10),
    pmRaCosDec: n.map(() => 10),
    pmDec: n.map(() => 0),
    radialVelocity: n.map(() => NaN),
    ...rest,
  };
}
