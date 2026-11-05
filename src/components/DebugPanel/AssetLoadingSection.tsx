/**
 * AssetLoadingSection — one row per asset slot, in boot fetch-queue order. Rows
 * are sorted by authored rank (`sortSlotsByFetchRank` owns the tiebreak; ranks
 * come from `assetPriorityBySlotName`), so a row whose start time disagrees with
 * its rank stands out. Subscribes to every slot on mount and re-renders on any
 * transition; debug scaffolding.
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
