/**
 * Tolerant float parser for VizieR fixed-width fields. A ReadMe documents a
 * missing value as `?=-`, but the data files pad the sentinel to the column
 * width with a *run* of dashes (`---   `, `--`), so any dash-only string is
 * "missing"; the `^-+$` anchor keeps a real negative like `-0.001` parsing.
 * Blank cells and unparseable junk collapse to NaN as well — the canonical
 * missing-value sentinel for `ParsedRecord` magnitudes and redshifts.
 * Not for RA/Dec: a malformed position should be a counted skip, not a quiet
 * NaN, so those fields use plain `parseFloat` + `Number.isFinite`.
 */
export function parseFloatOrNaN(s: string): number {
  const trimmed = s.trim();
  if (trimmed === '' || /^-+$/.test(trimmed)) return NaN;
  const v = parseFloat(trimmed);
  return Number.isFinite(v) ? v : NaN;
}
