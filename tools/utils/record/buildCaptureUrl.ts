/**
 * buildCaptureUrl — composes the harness's boot URL: the cinema gate plus the
 * pinned sim instant (`#t=<ISO>`, the exact shape `hashParamSources.ts`'s `t`
 * row writes and `parseHashParams` round-trips verbatim).
 *
 * Throws when `base` already carries a `?` or `#`: string-concatenating a
 * second `?cinema#t=` onto a `--url` that has its own would silently mangle
 * the operator's pin (e.g. `.../#t=X` + `/?cinema#t=Y`) rather than fail.
 */
export function buildCaptureUrl(opts: { base: string; simTime: Date }): string {
  const { base, simTime } = opts;
  if (base.includes('?') || base.includes('#')) {
    throw new Error(
      `--url must not carry its own query or hash (got '${base}'); the harness appends '?cinema#t=<ISO>' itself.`,
    );
  }
  return `${base}/?cinema#t=${simTime.toISOString()}`;
}
