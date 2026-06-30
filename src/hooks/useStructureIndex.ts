/**
 * `useStructureIndex` — snapshots the engine's loaded structures (featured
 * anchors + the bulk MCXC/MSCC catalog) into the lean `StructureSearchEntry[]`
 * the command palette's structure search ranks over.
 *
 * Unlike the alias index there's no network fetch to defer: the anchors are
 * built synchronously at engine boot and the bulk catalog is already loaded
 * by the time the user opens Cmd+K (structure categories are visible by
 * default, so the catalog fetches at boot).  So this hook just reads
 * `handle.sources.getStructures()` and maps it — cheap enough to redo on each
 * open rather than caching once-per-session.
 *
 * `paletteOpen` triggers the snapshot so a palette opened before the catalog
 * landed picks up the full set on the next open.  `sourceCounts` is an
 * additional recompute trigger: a catalog landing while the palette is already
 * open re-fires the map so newly-loaded structures appear without a reopen.
 *
 * Returns `[]` (not undefined) when nothing is loaded — the palette accepts an
 * empty index and degrades to galaxy-only search.
 */

import { useEffect, useState } from 'react';
import { toStructureSearchEntry } from '../utils/structure/toStructureSearchEntry';
import { useAppSelector } from '../store/hooks';
import { selectSourceCounts } from '../state/engine/selectors';
import type { StructureSearchEntry } from '../@types/engine/StructureSearchEntry';
import type { UseStructureIndexInput } from '../@types/engine/UseStructureIndexInput';

export function useStructureIndex({
  paletteOpen,
  engineHandleRef,
}: UseStructureIndexInput): readonly StructureSearchEntry[] {
  // A catalog landing while the palette is open should re-fire the snapshot;
  // `sourceCounts` bumps on every catalog arrival, so it serves as that trigger.
  const sourceCounts = useAppSelector(selectSourceCounts);

  const [index, setIndex] = useState<readonly StructureSearchEntry[]>([]);

  useEffect(() => {
    if (!paletteOpen) return;
    const handle = engineHandleRef.current;
    // Engine builds that predate the sources-handle structure accessor don't
    // expose it; guard and leave the index empty (galaxy-only search) rather
    // than throw.
    const structures = handle?.sources?.getStructures?.();
    if (!structures) return;
    setIndex(structures.map(toStructureSearchEntry));
  }, [paletteOpen, sourceCounts, engineHandleRef]); // engineHandleRef is a stable ref object — listed for linter correctness, never triggers re-run

  return index;
}
