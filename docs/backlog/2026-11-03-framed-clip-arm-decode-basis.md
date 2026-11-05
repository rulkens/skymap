# framedClipArm decodes with the current basis

**Why.** `framedClipArm` (`src/services/engine/camera/drivers/cameraDrivers.ts`) runs the arm's
`decode` with `poseBasis: to, upBasis: to`, the CURRENT basis, where the clip's channels were
authored through the pinned basis `from`. It re-encodes the absolute result from `from` to `to`
afterwards, which is right for the absolute row but not for a `decode` cell that reads a basis.

**Harmless today.** No `decode` cell reads `poseBasis` or `upBasis`. The day one does (a site
or sky row reading `upBasis`), it silently gets the wrong basis.

**Fix sketch.** Decode with `from` for both bases, then re-encode as now; or have each row say
which basis its channels live in. Add a test with a decode cell that reads a basis.
