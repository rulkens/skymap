/**
 * buildRiverChains — Natural Earth river pieces as whole rivers: each river's
 * pieces chained end to end, oriented source → mouth (the higher end is the
 * source), measured, and credited with the length of the longest river that
 * ends where they begin. Natural Earth splits one stem at its confluences into
 * separately numbered pieces; without that credit the width taper would
 * restart, thin, at every confluence.
 */

import type { RiverPiece } from '../@types/RiverPiece';
import type { RiverChain } from '../@types/RiverChain';
import { chainPolylines } from './chainPolylines';
import { greatCircleKm } from './greatCircleKm';

/** Degrees: one stem's pieces in Natural Earth can miss each other by ~2 km. */
const JOIN_TOLERANCE_DEG = 0.03;

export function buildRiverChains(
  pieces: readonly RiverPiece[],
  elevationAt: (lonDeg: number, latDeg: number) => number,
  radiusKm: number,
): RiverChain[] {
  const groups = new Map<string, RiverPiece[]>();
  for (const piece of pieces) groups.set(piece.key, [...(groups.get(piece.key) ?? []), piece]);

  const chains: Omit<RiverChain, 'upstreamKm'>[] = [];
  for (const group of groups.values()) {
    const scalerank = Math.min(...group.map((p) => p.scalerank));
    const minZoom = Math.min(...group.map((p) => p.minZoom));
    for (const line of chainPolylines(group.map((p) => p.points))) {
      const first = line[0]!;
      const last = line[line.length - 1]!;
      const points =
        elevationAt(first[0], first[1]) < elevationAt(last[0], last[1])
          ? [...line].reverse()
          : line;
      let lengthKm = 0;
      for (let i = 1; i < points.length; i++)
        lengthKm += greatCircleKm(points[i - 1]!, points[i]!, radiusKm);
      chains.push({ scalerank, minZoom, points, lengthKm });
    }
  }

  const cell = (p: readonly [number, number]) =>
    [Math.floor(p[0] / JOIN_TOLERANCE_DEG), Math.floor(p[1] / JOIN_TOLERANCE_DEG)] as const;
  const byMouth = new Map<string, number[]>();
  chains.forEach((chain, i) => {
    const [cx, cy] = cell(chain.points[chain.points.length - 1]!);
    byMouth.set(`${cx},${cy}`, [...(byMouth.get(`${cx},${cy}`) ?? []), i]);
  });
  const feeders = (i: number): number[] => {
    const source = chains[i]!.points[0]!;
    const [cx, cy] = cell(source);
    const out: number[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of byMouth.get(`${cx + dx},${cy + dy}`) ?? []) {
          const mouth = chains[j]!.points[chains[j]!.points.length - 1]!;
          if (
            j !== i &&
            Math.abs(mouth[0] - source[0]) < JOIN_TOLERANCE_DEG &&
            Math.abs(mouth[1] - source[1]) < JOIN_TOLERANCE_DEG
          )
            out.push(j);
        }
    return out;
  };
  const upstream = new Map<number, number>();
  const upstreamKm = (i: number): number => {
    const known = upstream.get(i);
    if (known !== undefined) return known;
    // Zero while in progress: a misoriented loop of pieces ends here instead of recursing forever.
    upstream.set(i, 0);
    const km = Math.max(0, ...feeders(i).map((j) => upstreamKm(j) + chains[j]!.lengthKm));
    upstream.set(i, km);
    return km;
  };
  return chains.map((chain, i) => ({ ...chain, upstreamKm: upstreamKm(i) }));
}
