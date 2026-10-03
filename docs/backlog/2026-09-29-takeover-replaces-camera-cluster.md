# Takeover's camera-cluster merge wipes any field it doesn't set

`ready`.

## What is true today

- `src/state/takeover/runTakeoverSaga.ts:29` —
  `yield* put(mergeSnapshot({ camera: { fovDeg: DEFAULT_FOV_DEG } }));`
  is the only field the takeover bracket sets on `camera` before running the
  body.
- `src/state/settings/mergeSettingsSnapshot.ts:38-42` —
  `mergeSettingsSnapshot` does
  `return { ...state, ...(structuredClone(patch) as Partial<EngineSettingsState>) };`.
  The spread is top-level only: a cluster present on the patch (`camera`)
  replaces the entire cluster object wholesale, it does not merge field by
  field into the existing cluster. The file's own header calls this out as
  intentional ("replace each cluster the snapshot carries, leave the rest
  untouched") for the tour-restore use case, where the snapshot always carries
  every field of a cluster it touches.
- `runTakeoverSaga`'s patch is `{ camera: { fovDeg: DEFAULT_FOV_DEG } }` —
  a partial `camera` cluster with only `fovDeg` set. Given the merge
  semantics above, this call replaces `settings.camera` with an object that
  has only `fovDeg`; every other current field of `CameraSettings` is
  dropped, not preserved.

So any field added to `CameraSettings` after this call was written is wiped
to `undefined` for the duration of every takeover (tour or exhibit), unless
that field happens to also be reasserted somewhere else in the same body.
The comment in `runTakeoverSaga.ts` describes this as merging the FOV back
"after this" for a body with different needs, but doesn't address that the
call already destroyed the rest of `camera` before the body runs.

## What would fix it

Either read the current `camera` cluster and spread it before overriding
`fovDeg` (`mergeSnapshot({ camera: { ...currentCamera, fovDeg: DEFAULT_FOV_DEG } })`),
or change `mergeSettingsSnapshot` to merge per-field within a cluster instead
of replacing the cluster object — the latter is the more general fix given
the header already documents cluster-replace as a deliberate, narrow choice
for the snapshot-restore path specifically.
