/**
 * `useFamousMeta` — load the famous-galaxy sidecars (`famous_meta.json`
 * and `famous_xrefs.json`) once at mount.  The engine *also* loads them
 * internally (via its `famousMeta` AssetSlot), but exposing a parallel
 * copy here lets the React layer (CommandPalette, deep-link drain) read
 * them without reaching into engine private state.  Double-loading is
 * cheap because the browser caches the JSON fetch — both readers hit
 * the same response.
 *
 * Why a hook rather than a top-level await or a context provider?
 * `famousMetaFetcher` is async; we need the React render cycle to pick
 * up the result, which means state.  And every call site is a single
 * React tree, so a hook is lighter than a Context.
 *
 * ### Why call the fetcher directly (rather than the engine handle)?
 *
 * The engine's slot loads at boot, but its result lives inside engine
 * state.  Exposing it through the handle would either require an
 * imperative getter (App polls), a callback prop (App reconstructs the
 * Engine spec), or a React Context wrapping the engine.  Calling the
 * pure fetcher here keeps the App's mental model simple: the engine
 * owns its copy for InfoCard text, App owns its copy for palette /
 * deep-link work.  HTTP cache makes the duplication free at the wire.
 *
 * ### Why catch on error rather than throw?
 *
 * The old `loadFamousSidecars` swallowed 404s into empty values; the new
 * fetcher throws so retry policy can branch on status.  We replicate the
 * pre-rework "absent file = feature off" UX here at the React seam by
 * catching and falling through to empty state, matching the engine's
 * own subscriber-side error handler in `engine.ts`.
 */

import { useEffect, useState } from 'react';
import {
  famousMetaFetcher,
  type FamousMetaEntry,
  type FamousXrefMap,
} from '../services/loading/fetchers/famousMetaFetcher';

export type UseFamousMetaReturn = {
  famousMeta: readonly FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
};

export function useFamousMeta(): UseFamousMetaReturn {
  const [famousMeta, setFamousMeta] = useState<readonly FamousMetaEntry[]>([]);
  const [famousXrefs, setFamousXrefs] = useState<FamousXrefMap>({});

  useEffect(() => {
    const ac = new AbortController();
    famousMetaFetcher(undefined as void, ac.signal, () => {})
      .then((sc) => {
        setFamousMeta(sc.meta);
        setFamousXrefs(sc.xrefs);
      })
      .catch(() => {
        // Match the pre-rework "absent file = feature off" UX: a 404 or
        // network error leaves the empty defaults in place so the
        // CommandPalette and deep-link drain operate without enriched
        // text rather than crashing.  Same fail-soft contract the
        // engine's own slot subscriber implements (see engine.ts).
      });
    return () => ac.abort();
  }, []);

  return { famousMeta, famousXrefs };
}
