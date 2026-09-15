/**
 * pgcAliasSlot — factory for the Cmd+K command palette's alias slot.
 *
 * The palette's alias search needs `pgc_aliases.json` (~1.7 MB).  Lazy:
 * most users never hit Cmd+K, so paying the download up front would be
 * wasteful.  The slot is minted for lifecycle parity with every other
 * asset, but `load()` is only invoked through the public-handle's
 * `loadPgcAliases()` shim on first palette open.
 *
 * No `commit` — the resolved Map is consumed by the React layer via the
 * Promise the shim returns; nothing engine-side to mutate, and so no deps.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { pgcAliasFetcher } from './pgcAliasFetcher';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { PgcAliasMap } from '../../../@types/loading/PgcAliasMap';

export function createPgcAliasSlot(): AssetSlot<PgcAliasMap, void> {
  return createAssetSlot<PgcAliasMap, void>({
    name: 'pgc-aliases',
    fetch: pgcAliasFetcher,
  });
}
