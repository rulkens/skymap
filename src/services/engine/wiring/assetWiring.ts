/**
 * ASSET_WIRING — the flat registry of every fetchable asset's lifecycle
 * contract (`key` + `factory` + `req` + `demand`), iterated by `wireSlots`
 * to construct the engine's slot table and by `reevaluateDemand` to decide
 * which slots should be loading right now.
 *
 * Filled in Task 10. The empty array here lets the registry's consumers
 * (`reevaluateDemand`) compile and ship ahead of the rows themselves —
 * the demand loop is row-agnostic, so it's correct against zero rows and
 * stays correct as rows are added.
 */

import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';

export const ASSET_WIRING: readonly AssetWiringRow[] = [];
