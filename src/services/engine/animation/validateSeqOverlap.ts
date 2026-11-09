/**
 * validateSeqOverlap — rules 1 and 2 of seq overlap: entries are finite and
 * non-negative, an array has one per duration join, and no overlap is longer
 * than a step it joins (or two overlaps together longer than one step).
 * Never a clamp: an authoring mistake names its seq and join.
 */
import type { SeqOverlap } from '../../../@types/animation/SeqOverlap';

export function validateSeqOverlap(
  startSec: number,
  overlap: SeqOverlap,
  durs: readonly number[],
): readonly number[] {
  const joins = Math.max(durs.length - 1, 0);
  const fail = (j: number, why: string): never => {
    throw new Error(`seq at ${startSec}s, join ${j + 1}: ${why}`);
  };
  if (typeof overlap !== 'number' && overlap.length !== joins) {
    fail(0, `overlap has ${overlap.length} entries but the seq has ${joins} joins`);
  }
  const per = Array.from({ length: joins }, (_, j) =>
    typeof overlap === 'number' ? overlap : overlap[j]!,
  );
  per.forEach((o, j) => {
    if (!Number.isFinite(o) || o < 0) fail(j, `overlap ${o} must be a finite number >= 0`);
    if (o > durs[j]! || o > durs[j + 1]!) {
      fail(j, `overlap ${o}s is longer than a step it joins (${durs[j]}s, ${durs[j + 1]}s)`);
    }
    if (j > 0 && per[j - 1]! + o > durs[j]!) {
      fail(j, `overlaps ${per[j - 1]}s + ${o}s are longer than the ${durs[j]}s step between them`);
    }
  });
  return per;
}
