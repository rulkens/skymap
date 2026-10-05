/**
 * The filaments family's whole runtime: the renderer and the slot that commits
 * into it. Non-null throughout — `create` builds both before returning, which is
 * what lets the pass and the fade guard read the renderer without a null check.
 */

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { FilamentCloud } from '../../../@types/data/filament/FilamentCloud';
import type { FilamentReq } from '../../../@types/loading/FilamentReq';
import type { FilamentRenderer } from '../../../@types/rendering/FilamentRenderer';

export type CosmicWebFilamentsRuntime = {
  readonly renderer: FilamentRenderer;
  readonly slot: AssetSlot<FilamentCloud, FilamentReq>;
};
