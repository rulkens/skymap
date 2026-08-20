/**
 * settings intent → row fade. Drives fades ONLY: never writes settings (the push
 * setters own that), never echoes to React. `guard(...) === false` short-circuits
 * before the fade AND before `post` — a demand-loaded row (flow) would otherwise
 * fade in nothing and run `post` against a half-built layer.
 */

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import { FADE_LAYERS } from './fadeLayers';

export type ApplyIntentState = Pick<EngineState, 'settings' | 'subsystems' | 'assetSlots' | 'gpu'>;

function applyIntent<Item>(
  state: ApplyIntentState,
  row: FadeLayer<Item>,
  item: Item,
  opts: { animate: boolean; durationMs?: number },
): void {
  // Row closures are typed against the full EngineState but only read the
  // clusters ApplyIntentState names, so the cast is sound at this boundary.
  if (row.guard?.(state as EngineState, item) === false) return;

  // applyIntent is only ever called on intent rows, so `intent` is present.
  const target = row.intent!(state.settings, item) ? 1 : 0;

  if (opts.animate) {
    const dur = opts.durationMs ?? (target === 1 ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS);
    void state.subsystems.fades.fadeTo(row.handle(item), target, dur);
  } else {
    state.subsystems.fades.setImmediate(row.handle(item), target);
  }

  row.post?.(state as EngineState, item);
}

export { applyIntent as applyIntentForTest };

/**
 * ### Why the wake is asymmetric
 *
 * `applyIntent` itself never wakes the scheduler; the wake is the whole reason
 * this batch bridge exists on top of it, and the two animate modes need opposite
 * treatment:
 *
 *   - `animate: false` snaps via `setImmediate`, which deliberately does NOT
 *     wake the loop (a snap is a frame-1 / non-animated path). So after the
 *     ENTIRE batch we issue exactly one `requestRender` to draw the snapped
 *     state once — one wake for the whole batch, not one per item.
 *   - `animate: true` drives `fadeTo`, which wakes the scheduler itself per the
 *     registry's contract. A batch wake here would be redundant, so we issue
 *     none.
 */
export function syncVisibilityFades(
  state: ApplyIntentState,
  opts: { animate: boolean; only?: readonly VisibilityLayerKey[]; durationMs?: number },
): void {
  const only = opts.only ? new Set(opts.only) : undefined;

  for (const row of FADE_LAYERS) {
    if (row.intent === undefined) continue;
    if (only && !only.has(row.key)) continue;

    for (const item of row.expand(state as EngineState)) {
      applyIntent(state, row, item, { animate: opts.animate, durationMs: opts.durationMs });
    }
  }

  if (!opts.animate) state.subsystems.scheduler.requestRender();
}

/**
 * Apply ONE row's intent to ONE item. The batch bridge's `only` narrows by ROW, so
 * `only: ['survey']` still drives ALL survey catalogs; a galaxy-catalog slot commit
 * must fade in just the catalog it uploaded, or a concurrent tier swap has source A's
 * commit re-drive B's mid-dissolve fade (last-issued wins) and B flickers up then down.
 * `item` is `unknown` because FADE_LAYERS erases rows to `FadeLayer<unknown>`.
 */
export function syncVisibilityFadeItem(
  state: ApplyIntentState,
  key: VisibilityLayerKey,
  item: unknown,
  opts: { durationMs?: number },
): void {
  const row = FADE_LAYERS.find((r) => r.key === key);
  if (row === undefined || row.intent === undefined) return;

  applyIntent(state, row, item, { ...opts, animate: true });
}
