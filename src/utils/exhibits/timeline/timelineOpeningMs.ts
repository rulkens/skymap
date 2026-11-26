/**
 * Where a timeline opens with no linked `t=`: on the wall clock while an authored span
 * (`endIso`) is running, else on its first stop. An open-ended timeline always runs to now, so
 * it opens on the first stop.
 */
export function timelineOpeningMs(
  endIso: string | undefined,
  firstStopMs: number,
  nowMs: number,
): number {
  if (endIso === undefined) return firstStopMs;
  return nowMs >= firstStopMs && nowMs <= Date.parse(endIso) ? nowMs : firstStopMs;
}
