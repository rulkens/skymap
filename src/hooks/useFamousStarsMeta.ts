/**
 * `useFamousStarsMeta` — load the famous-star `famous_stars_meta.json`
 * sidecar once at mount.  The star twin of `useFamousMeta`: the render
 * table already carries a star's drawable primitives, so this hook supplies
 * only the InfoCard's narrative/physical fields (spectral type, mass, age,
 * the prose description) to the React layer without reaching into engine
 * private state.  The fetch is cheap and cacheable — a repeat mount hits the
 * same browser-cached response.
 *
 * The engine *also* loads this sidecar internally (via its
 * `famousStarsMeta` AssetSlot, the star twin of `famousMeta`), but exposing
 * a parallel copy here lets the React layer read it without reaching into
 * engine private state — same rationale as `useFamousMeta`. Converting both
 * hooks to read the engine's copy through a shared bridge instead of
 * fetching independently is a separate consistency pass; this hook and its
 * galaxy-side sibling stay symmetric for now.
 *
 * ### Why we expose a `ready` flag
 *
 * A consumer (the BodyDetailCard) needs to know when the fetch has settled
 * so it can distinguish "still loading" from "loaded, but this star has no
 * sidecar entry".  `ready` flips true on both success AND swallowed-error
 * paths so a deployment without a `famous_stars_meta.json` doesn't leave the
 * card spinning forever — same fail-soft contract as the empty-state
 * defaults below.
 *
 * ### Why catch on error rather than throw?
 *
 * The fetcher throws on HTTP failure so a retry policy can branch on status.
 * We catch here and fall through to empty state + `ready=true`, matching the
 * galaxy hook's fail-soft handling.
 */

import { useEffect, useState } from 'react';
import { famousStarsMetaFetcher } from '../services/loading/fetchers/famousStarsMetaFetcher';
import type { FamousStarMetaEntry } from '../@types/loading/FamousStarMetaEntry';
import type { UseFamousStarsMetaReturn } from '../@types/engine/UseFamousStarsMetaReturn';

export function useFamousStarsMeta(): UseFamousStarsMetaReturn {
  const [famousStarsMeta, setFamousStarsMeta] = useState<readonly FamousStarMetaEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    // tier is ignored by famousStarsMetaFetcher; pass a placeholder so the
    // shared CompanionAssetReq shape stays uniform across companion
    // fetchers.  This hook fetches directly rather than reading the engine's
    // own `famousStarsMeta` slot, so the React layer never reaches into
    // engine private state — same payload either way, and the browser's HTTP
    // cache means the engine's own slot fetch doesn't pay for it twice.
    famousStarsMetaFetcher({ tier: 'medium' }, ac.signal, () => {})
      .then((sc) => {
        setFamousStarsMeta(sc.meta);
        setReady(true);
      })
      .catch(() => {
        // Absent / failed sidecar leaves the empty default in place AND
        // still flips `ready` to true so a card consumer doesn't spin.
        // Same fail-soft contract the galaxy hook implements.
        setReady(true);
      });
    return () => ac.abort();
  }, []);

  return { famousStarsMeta, ready };
}
