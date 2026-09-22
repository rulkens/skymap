/**
 * installSlots — the single mutation site for registry-built slots.
 *
 * `buildSlotsFromRegistry` returns slots without touching `state`; this
 * function is the one place that writes them onto `state.assetSlots`. Routing
 * every install through one seam (rather than each factory self-installing)
 * means the construction pass stays pure and testable, and "which slot landed
 * where" is auditable in a single function instead of scattered across the
 * factories.
 *
 * Two key spaces:
 *
 *   - **String keys** are the sidecar assets. Every sidecar `AssetKey` is a
 *     named field on `EngineAssetSlots` whose string spelling matches the key
 *     exactly, so the write is a direct `state.assetSlots[key] = slot`.
 *   - **Numeric keys** are `Source` codes. Core keeps no per-source map of its
 *     own: every per-source catalog (galaxy points, star catalogs) is
 *     `built: 'external'` or Layer-owned, so it never reaches this map —
 *     skipping it here is a defensive no-op.
 */

import { isBodyTextureKey } from '../../../utils/bodyTextures/isBodyTextureKey';
import { isCoreSlotFieldKey } from '../../../utils/loading/isCoreSlotFieldKey';
import { isMeshBodyKey } from '../../../utils/meshBodies/isMeshBodyKey';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';

export function installSlots(
  state: EngineState,
  slots: ReadonlyMap<AssetKey, AssetSlot<unknown, unknown>>,
): void {
  for (const [key, slot] of slots) {
    // Every per-source catalog self-installs elsewhere (galaxy points in
    // wireSlots, star catalogs onto the Layer's own runtime) — never here.
    if (typeof key === 'number') continue;
    // Body-texture and mesh-body family keys are `built: 'external'` (minted
    // in wireSlots into their own keyed maps), so the construction pass never
    // hands them here — the guards are a defensive skip that also narrows
    // `key` off the family members so the named-field index below typechecks.
    if (isBodyTextureKey(key) || isMeshBodyKey(key)) continue;
    // Total by construction: the build pass skips both the external families and
    // every Layer-owned key, so anything reaching here names a core field.
    if (!isCoreSlotFieldKey(state.assetSlots, key)) continue;
    state.assetSlots[key] = slot as never;
  }
}
