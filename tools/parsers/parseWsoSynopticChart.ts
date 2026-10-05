/**
 * parseWsoSynopticChart — a WSO source-surface synoptic chart as Carrington longitude (deg,
 * 0–355) → 30 field values (µT), north to south in equal steps of sine latitude. Each block's
 * 30 numbers wrap over several lines, so the match is whitespace-agnostic. A block with fewer
 * than 30 values is incomplete upstream and skipped; a file that is only an error line gives
 * an empty map.
 */

const BLOCK = /CT\d+:(\d+)\s+((?:[-\d.]+\s+){29}[-\d.]+)/g;

export function parseWsoSynopticChart(text: string): Map<number, number[]> {
  const columns = new Map<number, number[]>();
  for (const match of text.matchAll(BLOCK)) {
    // The chart opens at 360, the same meridian as 0; fold so the keys are 0..355.
    columns.set(Number(match[1]) % 360, match[2]!.split(/\s+/).map(Number));
  }
  return columns;
}
