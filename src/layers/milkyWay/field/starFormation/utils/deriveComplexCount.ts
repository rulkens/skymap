/**
 * Desired complex count from an event-derived `population` proxy (NOT
 * necessarily a raw event count — see `buildHiiShellsAndYoungWithSegments.ts`'s own per-event
 * density constant), scaled by the tier's own slider (a scaler, not an
 * absolute count) and clamped to `maxCount / childrenPerComplex` — the same
 * admission ceiling `buildDigVeil` already applied to a literal count.
 */
export function deriveComplexCount(
  population: number,
  scaler: number,
  childrenPerComplex: number,
  maxCount: number,
): number {
  if (childrenPerComplex <= 0) return 0;
  const desired = Math.max(0, Math.round(population * scaler));
  return Math.min(desired, Math.floor(maxCount / childrenPerComplex));
}
