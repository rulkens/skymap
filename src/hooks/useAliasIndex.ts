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
 * instead of `tier`.
 *
 * `sourceCounts` is read from the Redux engine slice via `useAppSelector`
 * rather than being threaded in as a prop.  It gates the lazy load (the
 * join requires at least one GLADE or 2MRS entry to be loaded) and acts
 * as a recompute trigger for the effect.
 */

import { useEffect, useRef, useState } from 'react';
import { Source } from '../data/sources';
import { buildAliasIndex } from '../utils/galaxy/buildAliasIndex';
import { useAppSelector } from '../store/hooks';
import { selectSourceCounts } from '../state/engine/selectors';
import type { AliasIndexEntry } from '../@types/engine/AliasIndexEntry';
import type { UseAliasIndexInput } from '../@types/engine/UseAliasIndexInput';
import type { UseAliasIndexReturn } from '../@types/engine/UseAliasIndexReturn';

export function useAliasIndex(input: UseAliasIndexInput): UseAliasIndexReturn {
  const { paletteOpen, engineHandleRef } = input;

  // `sourceCounts` gates the lazy GLADE/2MRS join (requires at least one
  // catalog to be loaded) and is an effect dependency so new arrivals
  // can unblock a pending load on the first open.
  const sourceCounts = useAppSelector(selectSourceCounts);

  const [aliasIndex, setAliasIndex] = useState<readonly AliasIndexEntry[] | null>(null);
  const [aliasMap, setAliasMap] = useState<ReadonlyMap<bigint, readonly string[]>>(() => new Map());
  // Tracks whether we've already kicked off the lazy load — the
  // effect's `paletteOpen` dependency would otherwise re-trigger on
  // every open.
  const aliasLoadStarted = useRef(false);

  useEffect(() => {
    if (!paletteOpen) return;
    if (aliasLoadStarted.current) return;
    const handle = engineHandleRef.current;
    if (!handle?.sources) return;
    // Don't kick off until at least one of GLADE / 2MRS has started
    // loading.  Without this guard the join walks a missing array and
    // emits no entries, permanently caching an empty index.
    const gladeCount = sourceCounts[Source.Glade] ?? 0;
    const twoMrsCount = sourceCounts[Source.TwoMRS] ?? 0;
    if (gladeCount === 0 && twoMrsCount === 0) return;
    // Asset-loading rework: the standalone `loadPgcAliases()` helper is
    // gone.  The engine handle exposes the same Promise contract via its
    // own slot-backed shim — same fail-soft "empty Map on error"
    // semantics, but progress + retry now flow through the asset-slot
    // machinery alongside every other load.  Engine builds that predate
    // the slot wiring don't expose this method; guard for that and
    // silently skip alias indexing in that case.
    if (!handle.selection?.loadAliases) return;

    aliasLoadStarted.current = true;
    handle.selection
      .loadAliases()
      .then((loadedAliasMap) => {
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
      })
      .catch(() => {
        // `loadAliases()` already resolves to an empty Map on a failed
        // fetch (see engine.ts's `awaitSlotReady` fallback), so this
        // never fires in practice; it exists only to satisfy the type
        // as a Promise. Leaving the index unset matches the sidecar-
        // absent case: alias search degrades to no results, not a crash.
      });
  }, [paletteOpen, sourceCounts, engineHandleRef]); // engineHandleRef is a stable ref object — listed for linter correctness, never triggers re-run

  return { aliasIndex, aliasMap };
}
