/**
 * isPreviewStale — the T18 packed-preview's freshness check: a `null` step
 * means nothing is packed (never stale, nothing to dispose); any other
 * mismatch (not just an increase — a reset can move `stepCount` backward
 * too) means the packed cube no longer matches the running sim.
 */
export function isPreviewStale(previewPackedAtStep: number | null, stepCount: number): boolean {
  return previewPackedAtStep !== null && previewPackedAtStep !== stepCount;
}
