/**
 * installSlots — the single mutation site for registry-built sidecar slots.
 *
 * `buildSlotsFromRegistry` returns slots without touching `state`; this
 * function is the one place that writes them onto `state.assetSlots`. Routing
 * every install through one seam (rather than each factory self-installing)
 * means the construction pass stays pure and testable, and "which slot landed
 * where" is auditable in a single function instead of scattered across six
 * factories.
 *
 * The map only ever carries the string-keyed sidecar assets — point sources
 * are `built: 'external'` and never appear here (they self-install into
 * `state.assetSlots.points` in `initGpu`). Every sidecar `AssetKey` is a named
 * field on `EngineAssetSlots` whose string spelling matches the key exactly, so
 * the write is a direct `state.assetSlots[key] = slot`. The numeric guard is a
 * defensive no-op: if a point key ever slips through, it is skipped rather than
 * mis-written into a named field.
 */

import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';

export function installSlots(
  state: EngineState,
  slots: ReadonlyMap<AssetKey, AssetSlot<unknown, unknown>>,
): void {
  for (const [key, slot] of slots) {
    // Numeric keys are point sources, installed in initGpu — never here.
    if (typeof key === 'number') continue;
    state.assetSlots[key] = slot as never;
  }
}
