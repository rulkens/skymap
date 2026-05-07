/**
 * CloudSource — a string discriminator used by the engine to tag the
 * "what file did we load?" identity of a per-survey PointCloud.  Mirrors
 * the union accepted by `EngineStatus.source` (the user-facing status
 * the React layer renders), so the engine can plumb the same value
 * through both `firstCloud.cloudSource` and `onStatusChange({kind:
 * 'ready', source})` without an intermediate translation.
 *
 * ### Why a string union instead of reusing `Source`
 *
 * `Source` is the per-point enum (used for visibility masking, the
 * pickRenderer's per-vertex `globalInstanceIdx`, and the renderer's
 * per-source draw loop).  `CloudSource` is a strict subset that
 * answers "which build artefact produced this cloud?" — its membership
 * mirrors the filenames in `public/data/`.  Keeping them separate lets
 * `EngineStatus.source` be a tight string literal that's safe to render
 * in UI without a translation table.
 *
 * ### Why a separate file
 *
 * Lifted out of the deleted `cloudLoader.ts` so the engine's import
 * graph doesn't depend on a load-orchestration module just for a type
 * alias.  Lives under `src/data/` because it's a fixed catalogue of
 * runtime artefacts — same reason `sources.ts` and `tierTargets.ts`
 * live there.
 */
export type CloudSource = 'sdss.bin' | '2mrs.bin' | 'glade.bin' | 'famous.bin' | 'synthetic';
