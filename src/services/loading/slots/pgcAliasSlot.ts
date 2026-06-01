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
 * Promise the shim returns; nothing engine-side to mutate.
 *
 * Construction-pure: builds + RETURNS the slot; `installSlots` owns the
 * write to `state.assetSlots`.
 */

import { createAssetSlot } from '../AssetSlot';
import { pgcAliasFetcher } from '../fetchers/pgcAliasFetcher';
import type { PgcAliasMap } from '../../../@types/loading/PgcAliasMap';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createPgcAliasSlot: SlotFactory<PgcAliasMap, void> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'pgc-aliases',
    fetch: pgcAliasFetcher,
  });
  return slot;
};
