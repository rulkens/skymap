# Octree chunk streams in the tile runtime's shape

**Readiness:** `needs-design` (user, 2026-10-22: "ideally the octree would mirror the structure").

The body-layers prep (#940, spec §6 P8) splits surface tiles into a plain-data `SurfaceTileRuntime`
stepped by pure `foldSurfaceTileEvents` / `stepSurfaceTiles`, and a `SurfaceTileStream` that only runs
effects and reports events. The star catalog's `OctreeChunkStream`
(`src/@types/octree/OctreeChunkStream.d.ts`) plays the same role for octree chunks but keeps its
residency inside itself (`resident(id)`, `hasFailed(id)`, `inFlightCount()`, `epoch()`), read by the
planner through those methods (`src/layers/starCatalog/frame.ts:73`).

Mirror the structure: an octree chunk runtime (resident chunks, failed ids, pending, epoch) as plain
data, a pure step from the octree cut's `touched`/`requests` to effects, and the stream reduced to
running them and reporting `chunkLoaded` / `chunkEvicted` / `chunkFailed`. Design questions: where the
decoded chunk copy lives (today "stays with its slot"), whether the runtime sits under the starCatalog
Layer's runtime, and whether `tileStreamSubsystem`'s own `loadedKeys`/`failedKeys` then fold into the
runtimes of both callers.
