/**
 * headlightGain — the headlight on a source at Doppler factor `d`: `h = d^k` folded through the
 * soft ceiling `h (1 + 1/ceil) / (1 + h / ceil)`, so it reads as `d^k` well below `ceil`, is exactly
 * 1 at `d = 1` (else the whole scene dims 1.5 % whenever D = 1), and never passes `ceil + 1`.
 * `k = 0` is off and exactly 1. The CPU twin of `lib/boost.wesl`'s `headlightGain`.
 */

export function headlightGain(d: number, k: number, ceil: number): number {
  if (k === 0) return 1;
  const h = d ** k;
  return (h * (1 + 1 / ceil)) / (1 + h / ceil);
}
