/**
 * Narrows a composed row's `AssetKey` to the named `EngineAssetSlots` field of
 * that name. False for a Layer-owned key (whose slot lives on the Layer's
 * runtime, reached through `state.layerSlots`) and for the keyed families, whose
 * keys are map entries rather than fields.
 */

import type { AssetKey } from '../../@types/loading/AssetKey';
import type { EngineAssetSlots } from '../../@types/engine/state/EngineAssetSlots';

export function isCoreSlotFieldKey(
  slots: EngineAssetSlots,
  key: AssetKey,
): key is Extract<AssetKey, keyof EngineAssetSlots> {
  return typeof key === 'string' && key in slots;
}
