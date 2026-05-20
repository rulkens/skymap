/**
 * `useFamousMeta` — load the famous-galaxy sidecars (`famous_meta.json`
 * and `famous_xrefs.json`) once at mount.  The engine *also* loads them
 * internally (via its `famousMeta` AssetSlot), but exposing a parallel
 * copy here lets the React layer (CommandPalette, deep-link drain,
 * splash gating) read them without reaching into engine private state.
 * Double-loading is cheap because the browser caches the JSON fetch —
 * both readers hit the same response.
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
 * ### Why call the fetcher directly (rather than the engine handle)?
 *
 * The engine's slot loads at boot, but its result lives inside engine
 * state.  Calling the pure fetcher here keeps the App's mental model
 * simple: the engine owns its copy for InfoCard text, App owns its copy
 * for palette / deep-link / splash work.  HTTP cache makes the
 * duplication free at the wire.
 *
 * ### Why catch on error rather than throw?
 *
 * The fetcher throws on network/HTTP errors so retry policy can branch
 * on status.  We catch here and fall through to empty state + `ready=true`,
 * matching the engine's own subscriber-side error handler in `engine.ts`.
 */

import { useEffect, useState } from 'react';
import { famousMetaFetcher } from '../services/loading/fetchers/famousMetaFetcher';
import type { FamousMetaEntry } from '../@types/loading/FamousMetaEntry';
import type { FamousXrefMap } from '../@types/loading/FamousXrefMap';
import type { UseFamousMetaReturn } from '../@types/engine/UseFamousMetaReturn';

export function useFamousMeta(): UseFamousMetaReturn {
  const [famousMeta, setFamousMeta] = useState<readonly FamousMetaEntry[]>([]);
  const [famousXrefs, setFamousXrefs] = useState<FamousXrefMap>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    famousMetaFetcher(undefined as void, ac.signal, () => {})
      .then((sc) => {
        setFamousMeta(sc.meta);
        setFamousXrefs(sc.xrefs);
        setReady(true);
      })
      .catch(() => {
        // Match the pre-rework "absent file = feature off" UX: a 404 or
        // network error leaves the empty defaults in place AND still flips
        // `ready` to true so the splash gate doesn't deadlock.
        setReady(true);
      });
    return () => ac.abort();
  }, []);

  return { famousMeta, famousXrefs, ready };
}
