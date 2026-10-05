# Dead and duplicated fields around the shared camera prefix

Every renderer uniform opens with `cam: CameraUniforms` (80 bytes, written by
`writeCameraPrefix` in `src/services/gpu/lib/cameraUniforms.ts`), whose
`pxPerRad` at byte 72 is the drawn view's focal term. Several structs still
carry surplus beside it. None renders wrong today because every write site
passes the same `ctx.drawPxPerRad` to both slots; each duplicate becomes wrong,
not just redundant, the day a view's value and a renderer's copy can disagree.

Found by the dome-fisheye deletion audit (PR #800), declined there as churn on
byte-exact uniforms under a deadline.

## Items

1. **Sgr A* lens: the whole prefix is dead.** Since the lens became a per-view
   fullscreen triangle, `bodies/sgrAStarLensing/vertex.wesl` and
   `fragment.wesl` read nothing from `u.cam`. Drop the `cam` member from
   `shaders/lib/sgrAStarLensing.wesl`, the `writeCameraPrefix` call and its
   three params in `packSgrAStarLensingUniforms.ts`, the three arguments in
   `sgrAStarLensingPass.ts`, and the parity test's `CameraUniforms` row. The
   struct goes 240 to 160 bytes; every offset moves by exactly -80, a
   multiple of 16, so vec3 landings and the `viewBasis` column stride survive.
   The parity test derives offsets from the WESL source and catches a slip.
2. **Five per-renderer `pxPerRad` copies.**
   - `galaxyCatalog/proceduralDisks/io.wesl:70-71`: `camPosWorld` and
     `pxPerRad` are both unread; delete them (96 to 80 bytes) and the tail
     writes in `proceduralDiskRenderer.ts`. No shader logic change.
   - `bodies/starPoints`, `milkyWay/pick`, `starCatalog`: one-token shader
     edit each, `u.pxPerRad` to `u.cam.pxPerRad`, then drop the field, its
     write and its offset docs. `milkyWay/pick`'s `camPosWorld` IS read; keep
     it. `starCatalog`'s pick pass writes only the prefix, so today its
     `toRefPx` divides by the zero tail and gets Infinity on an intensity the
     pick fragment ignores; after the swap it is finite. Assert that
     neutrality in a test rather than assume it.
   - `galaxyCatalog/points/io.wesl:137`: the prefix is populated since #800
     (`packGalaxyPointUniforms` now calls `writeCameraPrefix`), so the tail
     copy at byte 108 collapses like the three above.
3. **Dead write into a pad.** `instancedQuadRenderer.ts:386` writes
   `pxPerRad` into byte 92 of the texturedDisks uniform, which
   `texturedDisks/io.wesl:49` declares `_pad2`; the renderer's layout comment
   names a field that does not exist. Delete the write and fix the comment.
