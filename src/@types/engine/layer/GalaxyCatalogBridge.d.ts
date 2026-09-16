/**
 * The two galaxy reads `EngineHandle` still makes, parked on one nullable
 * `EngineState` field so `services/engine/**` imports nothing under
 * `src/layers/` (Ruling 5). Structural: `GalaxyCatalogRuntime` extends it, so
 * `tsc` pins the shape from the Layer side. 04e deletes all three.
 */

import type { SourceType } from '../../data/SourceType';
import type { GalaxyCatalog } from '../../data/galaxyCatalog/GalaxyCatalog';
import type { AssetSlot } from '../../loading/AssetSlot';
import type { PgcAliasMap } from '../../loading/PgcAliasMap';

export type GalaxyCatalogBridge = {
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly pgcAlias: AssetSlot<PgcAliasMap, void>;
};
