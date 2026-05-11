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
 * Pre-H4 the mint block lived inline in `wireSlots.ts`; extracted here
 * as part of the slot-factory split (2026-05-11 audit).
 */

import { createAssetSlot } from '../AssetSlot';
import { pgcAliasFetcher } from '../fetchers/pgcAliasFetcher';
import type { PgcAliasMap } from '../fetchers/pgcAliasFetcher';
import type { SlotFactory } from './types';

export const createPgcAliasSlot: SlotFactory<PgcAliasMap, void> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'pgc-aliases',
    fetch: pgcAliasFetcher,
  });
  state.assetSlots.pgcAlias = slot;
  return slot;
};
