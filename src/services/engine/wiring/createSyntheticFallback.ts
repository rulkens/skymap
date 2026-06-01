/**
 * createSyntheticFallback — the synthetic-survey fallback demand helper.
 *
 * The synthetic point cloud is the "no real data, show *something*" backstop:
 * it must load only when every real survey has been tried and none produced
 * usable data. That policy is a single predicate over sibling slot states —
 * exactly what `DemandCtx.slotState` exists for.
 *
 * ### Interpretation of "settled without success"
 *
 * `DemandCtx.slotState` exposes only the `LoadStateKind` discriminant — not the
 * loaded `count` — so this layer cannot distinguish "ready but empty" from
 * "ready with data". It approximates at the ctx level:
 *
 *   every real survey's `slotState` === 'error'
 *
 * A `ready` survey counts as a success. The empty-but-ready edge (a survey that
 * resolves with zero galaxies) needs the count, which only the slot-level
 * fallback wiring holds; that wiring is the precise gate and supersedes this
 * predicate where it disagrees. This module exports the ctx-level predicate so
 * the Synthetic row in `ASSET_WIRING` can reference it.
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
