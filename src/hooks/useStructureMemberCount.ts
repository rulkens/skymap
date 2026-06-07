/**
 * `useStructureMemberCount` — the live "N galaxies" figure for the
 * selected cluster / supercluster / void InfoCard.
 *
 * The count is a pure function of (selected structure, loaded catalogs,
 * survey visibility), so this hook is just a memoised call into
 * `structureMemberCount`.  The cone search is O(total loaded ≈ 2.5M) but
 * runs single-digit milliseconds and only when one of the memo deps
 * changes — selecting a different structure, a tier swap, a per-source
 * catalog landing (`sourceCounts` bump), or a survey toggle — never per
 * frame.
 *
 * Returns `null` (caller omits the row) when nothing is countable: no
 * structure selected, a famous-galaxy POI, or the engine handle / catalogs
 * aren't ready.  `getCloud` reads the engine's live catalog map, so a
 * stale tier never lingers — the next catalog landing re-fires the memo.
 */

import { useMemo } from 'react';
import { isPoi } from '../services/engine/isPoi';
import { structureMemberCount } from '../utils/structure/structureMemberCount';
import type { UseStructureMemberCountInput } from '../@types/engine/UseStructureMemberCountInput';

export function useStructureMemberCount({
  selected,
  engineHandleRef,
  tier,
  sourceCounts,
  visibleSourceMask,
}: UseStructureMemberCountInput): number | null {
  return useMemo(() => {
    if (selected === null || !isPoi(selected)) return null;
    const handle = engineHandleRef.current;
    if (handle === null) return null;
    return structureMemberCount(
      selected,
      (source) => handle.sources.getCloud(source),
      visibleSourceMask,
    );
    // `tier` and `sourceCounts` are intentional triggers — the body reads
    // the engine's live catalogs through `getCloud` rather than these
    // values, but a tier swap / catalog landing changes what that returns.
  }, [selected, tier, sourceCounts, visibleSourceMask, engineHandleRef]);
}
