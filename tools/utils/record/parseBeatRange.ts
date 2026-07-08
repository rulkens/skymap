/**
 * parseBeatRange — turn a recorder CLI '--range' argument into an inclusive
 * beat-index span.
 *
 * Indices are 0-based, matching the '#' column `npm run tour-length` prints
 * (`tools/animation/tourLength.ts`) — a beat sheet is the operator's map from
 * "which beat do I want" to "which index do I pass here", so the two must
 * agree byte-for-byte. A bare index ('4') is shorthand for the one-beat range
 * '4..4' rather than a separate code path, so the recorder's slicing logic
 * (which always wants a span) never needs a special case for "just one beat".
 */
export function parseBeatRange(raw: string): { from: number; to: number } {
  const match = /^(\d+)(?:\.\.(\d+))?$/.exec(raw.trim());
  if (match === null) {
    throw new Error(`parseBeatRange: malformed range '${raw}' — expected 'N' or 'N..M'`);
  }
  // Group 1 is mandatory in the pattern above, but noUncheckedIndexedAccess
  // still types array element access as possibly undefined, so this checks
  // what a successful match already guarantees rather than asserting past it.
  const fromStr = match[1];
  const toStr = match[2];
  if (fromStr === undefined) {
    throw new Error(`parseBeatRange: malformed range '${raw}' — expected 'N' or 'N..M'`);
  }
  const from = Number(fromStr);
  const to = toStr === undefined ? from : Number(toStr);
  if (to < from) {
    throw new Error(
      `parseBeatRange: reversed range '${raw}' — 'to' (${to}) precedes 'from' (${from})`,
    );
  }
  return { from, to };
}
