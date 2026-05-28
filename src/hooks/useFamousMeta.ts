/**
 * `useFamousMeta` — load the famous-galaxy `famous_meta.json` sidecar once
 * at mount.  The engine *also* loads it internally (via its `famousMeta`
 * AssetSlot), but exposing a parallel copy here lets the React layer
 * (CommandPalette, deep-link drain, splash gating) read it without
 * reaching into engine private state.  Double-loading is cheap because
 * the browser caches the JSON fetch — both readers hit the same response.
 *
 * ### Why we expose a `ready` flag
 *
 * The splash gating (`useSplash`) needs to know when the famous-meta
 * fetch has settled so it can activate the Tour CTA (which depends on
 * famous-meta lookups to anchor the tour beats).  `ready` flips true
 * on both success AND swallowed-error paths so a deployment without a
 * famous_meta.json doesn't deadlock the splash — same fail-soft
 * contract as the empty-state defaults below.
 *
 * ### Why catch on error rather than throw?
 *
 * The fetcher throws on HTTP failure so retry policy can branch on status.
 * We catch here and fall through to empty state + `ready=true`, matching
 * the engine's own subscriber-side error handler in `engine.ts`.
 */

import { useEffect, useState } from 'react';
import { famousMetaFetcher } from '../services/loading/fetchers/famousMetaFetcher';
import type { FamousMetaEntry } from '../@types/loading/FamousMetaEntry';
import type { UseFamousMetaReturn } from '../@types/engine/UseFamousMetaReturn';

export function useFamousMeta(): UseFamousMetaReturn {
  const [famousMeta, setFamousMeta] = useState<readonly FamousMetaEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    // tier is ignored by famousMetaFetcher; pass a placeholder so the
    // shared CompanionAssetReq shape stays uniform across companion
    // fetchers.  The hook predates the engine's slot-based wiring and
    // calls the fetcher directly for App.tsx — same payload either way.
    famousMetaFetcher({ tier: 'medium' }, ac.signal, () => {})
      .then((sc) => {
        setFamousMeta(sc.meta);
        setReady(true);
      })
      .catch(() => {
        // Absent / failed sidecar leaves the empty default in place AND
        // still flips `ready` to true so the splash gate doesn't deadlock.
        // Same fail-soft contract the engine's own slot subscriber implements.
        setReady(true);
      });
    return () => ac.abort();
  }, []);

  return { famousMeta, ready };
}
