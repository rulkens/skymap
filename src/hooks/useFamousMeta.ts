/**
 * `useFamousMeta` — load the famous-galaxy `famous_meta.json` sidecar once
 * at mount.  The engine *also* loads it internally (via its `famousMeta`
 * AssetSlot), but exposing a parallel copy here lets the React layer
 * (CommandPalette, deep-link drain) read it without reaching into engine
 * private state.  Double-loading is cheap because the browser caches the
 * JSON fetch — both readers hit the same response.
 *
 * Why a hook rather than a top-level await or a context provider?
 * `famousMetaFetcher` is async; we need the React render cycle to pick
 * up the result, which means state.  And every call site is a single
 * React tree, so a hook is lighter than a Context.
 *
 * ### Why catch on error rather than throw?
 *
 * The fetcher throws on HTTP failure so retry policy can branch on status.
 * We replicate the "absent file = feature off" UX here at the React seam
 * by catching and falling through to an empty array, matching the engine's
 * own subscriber-side error handler in `engine.ts`.
 */

import { useEffect, useState } from 'react';
import { famousMetaFetcher } from '../services/loading/fetchers/famousMetaFetcher';
import type { FamousMetaEntry } from '../@types/loading/FamousMetaEntry';
import type { UseFamousMetaReturn } from '../@types/engine/UseFamousMetaReturn';

export function useFamousMeta(): UseFamousMetaReturn {
  const [famousMeta, setFamousMeta] = useState<readonly FamousMetaEntry[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    // tier is ignored by famousMetaFetcher; pass a placeholder so the
    // shared CompanionAssetReq shape stays uniform across companion
    // fetchers.  The hook predates the engine's slot-based wiring and
    // calls the fetcher directly for App.tsx — same payload either way.
    famousMetaFetcher({ tier: 'medium' }, ac.signal, () => {})
      .then((sc) => {
        setFamousMeta(sc.meta);
      })
      .catch(() => {
        // Absent / failed sidecar leaves the empty default in place so
        // the CommandPalette and deep-link drain operate without enriched
        // text rather than crashing.  Same fail-soft contract the engine's
        // own slot subscriber implements (see engine.ts).
      });
    return () => ac.abort();
  }, []);

  return { famousMeta };
}
