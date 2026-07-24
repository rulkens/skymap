/**
 * AssetLoadingSection — one row per asset slot, ordered the way the boot fetch
 * queue orders them.
 *
 * ### Why rank order rather than registry order
 *
 * The engine's slot Map is insertion-ordered by which bootstrap phase minted
 * each slot, so reading fetch order off the panel meant knowing the wiring
 * table by heart. Sorting by the authored `ASSET_WIRING` rank — and showing
 * that rank in its own column — makes the intended order the panel's default
 * reading, and any row whose start time disagrees with its rank stands out.
 *
 * `sortSlotsByFetchRank` owns the tiebreak (whole families share a rank), and
 * the rank map is derived from `ASSET_WIRING` by
 * `assetPriorityBySlotName` — this component never restates a rank.
 *
 * ### Subscription
 *
 * Subscribes to every slot once on mount and re-renders the whole section on
 * any transition. Debug scaffolding; the cost is negligible at the project's
 * slot count.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { LoadStateFilter } from '../../@types/loading/LoadStateFilter';
import { aggregateRegistry } from '../../services/loading/aggregateRegistry';
import { matchesLoadStateFilter } from '../../utils/loading/matchesLoadStateFilter';
import { sortSlotsByFetchRank } from '../../utils/loading/sortSlotsByFetchRank';
import AssetLoadingTitle from './AssetLoadingTitle';
import DebugSection from './DebugSection';
import SlotRow from './SlotRow';

export type AssetLoadingSectionProps = {
  readonly slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  /** Authored fetch rank per slot name, from the engine's `debug.assetPriorities()`. */
  readonly assetPriorities: () => ReadonlyMap<string, number>;
};

function AssetLoadingSection({ slots, assetPriorities }: AssetLoadingSectionProps): ReactNode {
  // The setState value itself is unused — only the setter matters as a
  // re-render trigger.  Naming the value `_tick` (and using the
  // `_`-prefix lint convention) would also work; destructuring out
  // only the setter is the most concise spelling.
  const [, force] = useState(0);
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    for (const [, slot] of slots) {
      unsubs.push(slot.subscribe(() => force((n) => n + 1)));
    }
    return () => unsubs.forEach((u) => u());
  }, [slots]);

  const [filter, setFilter] = useState<LoadStateFilter>(null);
  const toggleFilter = (kind: LoadStateFilter) =>
    setFilter((current) => (current === kind ? null : kind));

  const snap = aggregateRegistry(slots);
  const ranks = assetPriorities();
  // The timeline origin is the EARLIEST start across every slot, filtered rows
  // included: a filter narrows what you read, it must not move the zero the
  // remaining rows are measured against.
  const originMs = earliestStartMs(slots);
  const visible = sortSlotsByFetchRank(snap.slots, ranks).filter(({ state }) =>
    matchesLoadStateFilter(filter, state.kind),
  );

  return (
    <DebugSection
      title={<AssetLoadingTitle slots={snap.slots} filter={filter} onToggleFilter={toggleFilter} />}
    >
      {visible.map(({ name, state }) => {
        // `slots.get(name)` cannot return undefined here because `snap.slots`
        // is built directly from the same Map's iteration order, but the
        // `noUncheckedIndexedAccess`-aware compiler can't prove that.
        // Skipping the row when the slot is missing is the safe degradation.
        const slot = slots.get(name);
        if (!slot) return null;
        return (
          <SlotRow
            key={name}
            name={name}
            state={state}
            slot={slot}
            rank={ranks.get(name) ?? null}
            timelineOriginMs={originMs}
          />
        );
      })}
    </DebugSection>
  );
}

/** Wall clock of the first `load()` any slot saw, or `null` before the first one. */
function earliestStartMs(slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>): number | null {
  let earliest: number | null = null;
  for (const [, slot] of slots) {
    const startedAtMs = slot.startedAtMs();
    if (startedAtMs !== null && (earliest === null || startedAtMs < earliest)) {
      earliest = startedAtMs;
    }
  }
  return earliest;
}

export default AssetLoadingSection;
