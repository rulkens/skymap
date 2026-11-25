/** Fork parity: `precision(4)`/`precision(2)` (std::defaultfloat) — the shortest
 * fixed-or-scientific form carrying exactly `sigFigs` significant digits. */
export function formatSignificant(value: number, sigFigs: number): string {
  return Number.isFinite(value) ? value.toPrecision(sigFigs) : '—';
}
