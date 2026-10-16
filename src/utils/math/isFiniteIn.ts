/** True for a finite number within `lo..hi` inclusive; a guard for untrusted input. */
export function isFiniteIn(raw: unknown, lo: number, hi: number): raw is number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= lo && raw <= hi;
}
