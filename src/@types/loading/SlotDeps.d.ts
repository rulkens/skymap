/**
 * SlotDeps — the bag `AssetWiringRow.factory` receives, so every row's factory is
 * called the same way (`row.factory(deps)`) whoever owns the slot. A Layer's row
 * hands back a slot its `create` already minted and ignores the bag.
 */

import type { EngineState } from '../engine/state/EngineState';
import type { EngineCallbacks } from '../engine/EngineCallbacks';

export type SlotDeps = {
  state: EngineState;
  cb: EngineCallbacks;
};
