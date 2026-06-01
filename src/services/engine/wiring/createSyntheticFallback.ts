/**
 * createSyntheticFallback — the synthetic-survey fallback demand helper.
 *
 * The synthetic point cloud is the "no real data, show *something*" backstop:
 * it must load only when every real survey has been tried and none produced
 * usable data. The legacy `wireSlots` gate spelled this out imperatively with
 * a `realSettled` counter and an `anyRealReady` flag flipped by per-slot
 * subscribers. In the demand-driven model that policy collapses to a single
 * predicate over sibling slot states — exactly what `DemandCtx.slotState`
 * exists for.
 *
 * ### Interpretation of "settled without success"
 *
 * The legacy gate counted a survey as "ready+success" when its slot reached
 * `ready` with `count > 0`, and fired synthetic only after all surveys settled
 * (`ready` OR `error`) with no such success. `DemandCtx.slotState` exposes only
 * the `LoadStateKind` discriminant — not the loaded `count` — so this layer
 * cannot see "ready but empty". We therefore approximate at the ctx level:
 *
 *   every real survey's `slotState` === 'error'
 *
 * A `ready` survey counts as a success (the empty-but-ready edge is rare and is
 * handled, if at all, by Task 13's slot-level wiring, which still has the count
 * in hand). This keeps the predicate honest about what it can actually observe
 * here: all real surveys failed ⇒ fall back to synthetic.
 *
 * NOTE: Task 13 owns the precise gate (subscription wiring + the empty-ready
 * edge). This module currently exports only the ctx-level predicate so the
 * Synthetic row in `ASSET_WIRING` can reference it; Task 13 refines.
 */

import { SURVEY_POINT_SOURCES } from './galaxyCatalogSourceRegistry';
import type { DemandCtx } from '../../../@types/loading/DemandCtx';

/**
 * True when every real survey (`SURVEY_POINT_SOURCES`) has settled in `error`.
 * The trigger for loading the synthetic fallback cloud.
 */
export function allSurveysSettledWithoutSuccess(ctx: DemandCtx): boolean {
  return SURVEY_POINT_SOURCES.every((source) => ctx.slotState(source) === 'error');
}
