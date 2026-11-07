/**
 * buildCaptureUrl — composes the harness's boot URL: the cinema gate plus the
 * pinned sim instant (`#t=<ISO>`, the exact shape `hashParamSources.ts`'s `t`
 * row writes and `parseHashParams` round-trips verbatim).
 *
 * Throws when `base` already carries a `?` or `#`: string-concatenating a
 * second `?cinema#t=` onto a `--url` that has its own would silently mangle
 * the operator's pin (e.g. `.../#t=X` + `/?cinema#t=Y`) rather than fail.
 *
 * Strips ALL trailing slashes before composing, not just one: `record.ts`'s
 * `--url` parsing strips a single trailing slash, so a doubled one
 * (`http://localhost:5173//`) reaches here intact and would otherwise compose
 * a `//?cinema` path that loads but never installs the recorder hook,
 * surfacing right after boot as "`__skymapRecorder` missing" instead of a
 * clear error here.
 *
 * `dome` adds `&dome` — the same URL gate `hasUrlGate('dome')` reads in
 * `engine.ts` to seed `state.viewRig`.
 *
 * `pose` (an `encodeFramedPose` string) adds `&pose=`, so the page BOOTS at a
 * clip's start pose: asset demand is scale-gated, so a clip that jumps far from
 * the Earth boot pose would otherwise open on a scene still loading.
 */
export function buildCaptureUrl(opts: {
  base: string;
  simTime: Date;
  dome: boolean;
  pose?: string;
}): string {
  const { base: rawBase, simTime, dome, pose } = opts;
  const base = rawBase.replace(/\/+$/, '');
  if (base.includes('?') || base.includes('#')) {
    throw new Error(
      `--url must not carry its own query or hash (got '${rawBase}'); the harness appends '?cinema#t=<ISO>' itself.`,
    );
  }
  const poseParam = pose === undefined ? '' : `&pose=${pose}`;
  return `${base}/?cinema${dome ? '&dome' : ''}#t=${simTime.toISOString()}${poseParam}`;
}
