/**
 * `useFamousMeta` — load the famous-galaxy sidecars (`famous_meta.json`
 * and `famous_xrefs.json`) once at mount.  The engine *also* loads them
 * internally, but exposing a parallel copy here lets the React layer
 * (CommandPalette, deep-link drain) read them without reaching into
 * engine private state.  Double-loading is cheap because the browser
 * caches the JSON fetch — both readers hit the same response.
 *
 * Why a hook rather than a top-level await or a context provider?
 * `loadFamousSidecars` is async; we need the React render cycle to
 * pick up the result, which means state.  And every call site is a
 * single React tree, so a hook is lighter than a Context.
 */

import { useEffect, useState } from 'react';
import {
  loadFamousSidecars,
  type FamousMetaEntry,
  type FamousXrefMap,
} from '../services/engine/famousMetaLoader';

export type UseFamousMetaReturn = {
  famousMeta: FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
};

export function useFamousMeta(): UseFamousMetaReturn {
  const [famousMeta, setFamousMeta] = useState<FamousMetaEntry[]>([]);
  const [famousXrefs, setFamousXrefs] = useState<FamousXrefMap>({});

  useEffect(() => {
    loadFamousSidecars().then((sc) => {
      setFamousMeta(sc.meta);
      setFamousXrefs(sc.xrefs);
    });
  }, []);

  return { famousMeta, famousXrefs };
}
