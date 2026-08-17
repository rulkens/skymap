/**
 * `useStructureMemberCount` — the live "N galaxies" figure for the
 * selected cluster / supercluster / void InfoCard.
 *
 * The count is a pure function of (selected structure, loaded catalogs,
 * galaxy catalog visibility), so this hook is just a memoised call into
 * `structureMemberCount`.  The cone search is O(total loaded ≈ 2.5M) but
 * runs single-digit milliseconds and only when one of the memo deps
 * changes — selecting a different structure, a tier swap, a per-source
 * catalog landing (`sourceCounts` bump from the engine slice), or a galaxy
 * catalog toggle — never per frame.
 *
 * `sourceCounts` is read from the Redux engine slice via `useAppSelector`
 * rather than being threaded in as a prop.  It is an intentional recompute
 * trigger: when a catalog lands the engine dispatches
 * `engineSourceCountReported`, which bumps the selector output and re-fires
 * the memo so the count reflects the newly loaded data.
 *
 * Returns `null` (caller omits the row) when nothing is countable: no
 * structure selected, a famous-galaxy selection, or the engine handle / catalogs
 * aren't ready.  `getCloud` reads the engine's live catalog map, so a
 * stale tier never lingers — the next catalog landing re-fires the memo.
 */

import { useMemo } from 'react';
import { structureMemberCount } from '../utils/structure/structureMemberCount';
import { useAppSelector } from '../store/hooks';
import { selectSourceCounts } from '../state/engine/selectors';
import type { UseStructureMemberCountInput } from '../@types/engine/UseStructureMemberCountInput';

export function useStructureMemberCount({
  selected,
  engineHandleRef,
  tier,
  visibleSourceMask,
}: UseStructureMemberCountInput): number | null {
  // `sourceCounts` is an intentional recompute trigger: each catalog landing
  // dispatches `engineSourceCountReported`, bumping this selector and re-firing
  // the memo so the member count reflects the newly loaded data.
  const sourceCounts = useAppSelector(selectSourceCounts);

  return useMemo(() => {
    // Narrow on the union tag, not a structural sniff: only a `structure`
    // target is countable, and `type !== 'structure'` narrows `selected`
    // to StructureInfo for the call below without a cast.
    if (selected === null || selected.type !== 'structure') return null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tier/sourceCounts are recompute triggers, not read in the body (see comment above)
  }, [selected, tier, sourceCounts, visibleSourceMask, engineHandleRef]);
}
