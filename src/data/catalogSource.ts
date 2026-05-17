/**
 * CatalogSource — a string discriminator used by the engine to tag the
 * "what file did we load?" identity of a per-survey GalaxyCatalog.  Mirrors
 * the union accepted by `EngineStatus.source` (the user-facing status
 * the React layer renders), so the engine can plumb the same value
 * through both `firstCatalog.catalogSource` and `onStatusChange({kind:
 * 'ready', source})` without an intermediate translation.
 *
 * ### Why a string union instead of reusing `Source`
 *
 * `Source` is the per-point enum (used for visibility masking, the
 * pickRenderer's per-source `cloud.sourceCode` packing, and the
 * renderer's per-source draw loop).  `CatalogSource` is a strict subset
 * that answers "which build artefact produced this catalog?" — its
 * membership mirrors the filenames in `public/data/`.  Keeping them
 * separate lets `EngineStatus.source` be a tight string literal that's
 * safe to render in UI without a translation table.
 *
 * ### Why a separate file
 *
 * Lifted out of the deleted `cloudLoader.ts` so the engine's import
 * graph doesn't depend on a load-orchestration module just for a type
 * alias.  Lives under `src/data/` because it's a fixed catalogue of
 * runtime artefacts — same reason `sources.ts` and `tierTargets.ts`
 * live there.
 */
import type { CatalogSource } from '../@types/data/CatalogSource';

import { Source } from './sources';

/**
 * Map a `Source` enum value to its `CatalogSource` filename label.
 *
 * Single canonical mapping — every consumer that needs the
 * UI-facing source string (engine status, dev panel, status bar)
 * goes through here so the filename literals don't drift.
 */
export function catalogSourceFor(source: Source): CatalogSource {
  switch (source) {
    case Source.SDSS:
      return 'sdss.bin';
    case Source.TwoMRS:
      return '2mrs.bin';
    case Source.Glade:
      return 'glade.bin';
    case Source.Famous:
      return 'famous.bin';
    default:
      return 'synthetic';
  }
}
