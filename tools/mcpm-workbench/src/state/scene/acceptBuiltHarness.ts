import type { McpmHarness } from '../../../@types/McpmHarness';
import type { RenderResources } from '../../render/renderResources';

/**
 * acceptBuiltHarness — the one place a resolved `createMcpmHarness()` promise
 * decides whether it's still wanted. Called from INSIDE the promise's own
 * `.then()`, never after a saga `yield*`: `takeLatest` cancellation unwinds the
 * generator via `iterator.return()` synchronously and marks the pending
 * effect settled, so redux-saga drops the eventual resolved value rather than
 * resuming the generator with it — code placed after that `yield*` can never
 * run for a build cancelled while this promise was in flight. `cancellation.
 * aborted` (set synchronously in the worker's own `finally`, which DOES run
 * at cancellation time) is what catches that case here instead.
 * `resources.epoch !== myEpoch` is the second, independent guard: a dispose
 * that happens WITHOUT saga cancellation at all (Viewport's unmount calls
 * `disposeScene` directly) bumps epoch but never touches `cancellation`.
 */
export function acceptBuiltHarness(
  built: McpmHarness,
  resources: Pick<RenderResources, 'epoch'>,
  myEpoch: number,
  cancellation: { readonly aborted: boolean },
): McpmHarness | null {
  if (cancellation.aborted || resources.epoch !== myEpoch) {
    built.dispose();
    return null;
  }
  return built;
}
