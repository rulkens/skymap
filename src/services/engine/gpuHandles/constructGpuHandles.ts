import type { GpuHandleRow } from '../../../@types/engine/handles/GpuHandleRow';
import type { GpuHandleKey } from '../../../@types/engine/handles/GpuHandleKey';
import type { GpuHandleConstructDeps } from '../../../@types/engine/handles/GpuHandleConstructDeps';
import type { EngineState } from '../../../@types/engine/state/EngineState';

/**
 * Walks `rows` in array order, writing each row's constructed handle onto
 * `state.gpu` before moving to the next — so a later row's `construct`
 * (e.g. `starCatalogPickRenderer`) can read an earlier row's result straight
 * off `state.gpu.<key>`, matching today's hand-written `initGpu.ts` body.
 */
export function constructGpuHandles(
  rows: readonly GpuHandleRow[],
  state: EngineState,
  deps: GpuHandleConstructDeps,
): void {
  for (const row of rows) {
    // GpuHandleRow is distributive over GpuHandleKey, so each row literal
    // already pins `construct`'s return to its own key's exact field type —
    // tsc just can't carry that correlation through the loop variable's
    // union type. The cast papers over that gap only; it adds no real slack.
    (state.gpu as Record<GpuHandleKey, unknown>)[row.key] = row.construct(state, deps);
  }
}
