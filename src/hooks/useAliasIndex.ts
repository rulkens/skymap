/**
 * `useAliasIndex` — lazy two-phase pipeline that powers the command
 * palette's alias search:
 *
 *   1. Fetch `pgc_aliases.json` (the PGC → human-name Map, ~1.7 MB).
 *   2. Walk the engine's GLADE and 2MRS objID arrays, look up each
 *      non-zero PGC, emit one `AliasIndexEntry` per match.
 *
 * Both phases happen exactly once per session, on the first palette
 * open.  Why not at engine-ready time?  Most users never hit Cmd+K —
 * paying the 1.7 MB JSON download up front would be wasteful for them.
 *
 * `aliasIndex === null` means "not loaded yet"; `[]` means "loaded but
 * empty" (sidecar absent, or join produced no hits).  The palette
 * accepts undefined/empty without complaint.
 *
 * `aliasMap` (the raw Map) is also returned because the deep-link
 * resolver uses it as the "is this PGC a real galaxy in HyperLEDA?"
 * oracle for the tier-vs-unknown distinction.  Starts as an empty Map
 * so callers can call `.has(...)` without a null guard before the load
 * resolves; an empty map just collapses unknown PGCs to `unknown`
 * instead of `tier`, which is documented in `resolveFocusTarget.ts`.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { EngineHandle } from '../@types';
import { Source } from '../data/sources';
import {
  loadPgcAliases,
  type AliasIndexEntry,
} from '../services/engine/pgcAliasLoader';
import { buildAliasIndex } from './buildAliasIndex';

export type UseAliasIndexInput = {
  paletteOpen: boolean;
  sourceCounts: Partial<Record<Source, number>>;
  engineHandleRef: RefObject<EngineHandle | null>;
};

export type UseAliasIndexReturn = {
  aliasIndex: readonly AliasIndexEntry[] | null;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
};

export function useAliasIndex(input: UseAliasIndexInput): UseAliasIndexReturn {
  const { paletteOpen, sourceCounts, engineHandleRef } = input;

  const [aliasIndex, setAliasIndex] = useState<readonly AliasIndexEntry[] | null>(null);
  const [aliasMap, setAliasMap] = useState<ReadonlyMap<bigint, readonly string[]>>(
    () => new Map(),
  );
  // Tracks whether we've already kicked off the lazy load — the
  // effect's `paletteOpen` dependency would otherwise re-trigger on
  // every open.
  const aliasLoadStarted = useRef(false);

  useEffect(() => {
    if (!paletteOpen) return;
    if (aliasLoadStarted.current) return;
    const handle = engineHandleRef.current;
    if (!handle?.getCloudObjIds) return;
    // Don't kick off until at least one of GLADE / 2MRS has started
    // loading.  Without this guard the join walks a missing array and
    // emits no entries, permanently caching an empty index.
    const gladeCount = sourceCounts[Source.Glade] ?? 0;
    const twoMrsCount = sourceCounts[Source.TwoMRS] ?? 0;
    if (gladeCount === 0 && twoMrsCount === 0) return;

    aliasLoadStarted.current = true;
    loadPgcAliases().then((loadedAliasMap) => {
      // Stash the raw Map first for the deep-link resolver oracle —
      // it only needs `.has(pgc)`, not the per-source localIdx join.
      setAliasMap(loadedAliasMap);
      setAliasIndex(
        buildAliasIndex({
          handle,
          aliasMap: loadedAliasMap,
          sources: [Source.Glade, Source.TwoMRS],
        }),
      );
    });
  }, [paletteOpen, sourceCounts, engineHandleRef]);

  return { aliasIndex, aliasMap };
}
