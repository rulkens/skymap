/**
 * planOnce — call a `once`-scope `ContentPlanner`'s `plan`, narrowing past
 * the union `ContentPlanner<T>` synthesizes for `.plan`'s parameter types
 * (calling an unnarrowed union member widens each parameter position to the
 * INTERSECTION of every arm's type there, which no real value satisfies).
 * Throws if handed a `perView` planner instead.
 */

import type { ContentPlanner } from '../../../src/@types/engine/frame/ContentPlanner';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { PlanResult } from '../../../src/@types/engine/frame/PlanResult';
import type { ReadyFrameContext } from '../../../src/@types/engine/frame/ReadyFrameContext';

export function planOnce<T>(
  planner: ContentPlanner<T>,
  snapshot: ReadyFrameContext,
  views: readonly FrameView[],
  state: PassState,
): PlanResult<T> {
  if (planner.scope !== 'once') {
    throw new Error(`planOnce: '${planner.name}' is not a 'once'-scope planner`);
  }
  return planner.plan(snapshot, views, state);
}
