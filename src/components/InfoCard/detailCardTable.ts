/**
 * detailCardTable — folds core's four FocusableTarget arms with every Layer's
 * `detailCard` ui-slot contribution into the `DetailCardTable` InfoCard
 * dispatches on. Called once at module load (`InfoCard.tsx`), so a missing arm
 * throws at boot naming the union member nobody claimed — a composition
 * wiring bug, not one to surface per-render.
 *
 * Each core entry is the card component itself — `GalaxyDetailCard` /
 * `CompactCard` for a galaxy, `StructureDetailCard` / `CompactStructureCard`
 * for a structure, and so on — InfoCard renders `entry.Detail`/`entry.Compact`
 * as JSX, so every card's own props type must already match
 * `DetailCardProps<K>`/`CompactCardProps<K>` (the table key `K` is the
 * narrowing proof; a card never re-checks `target.type`).
 *
 * Dispatching on `target.type` through a `DetailCardTable` follows the
 * simplicity convention's table-dispatch rule (item 7): a new focusable kind
 * adds one Layer `ui` entry instead of a render branch in InfoCard. InfoCard
 * keeps the outer-wrapper-stable contract and the
 * hover/pinned stacking around this lookup; the table only decides which card
 * a given target renders as.
 */

import type { Layer } from '../../@types/engine/layer/Layer';
import type { SelectionKind } from '../../@types/engine/SelectionKind';
import type { DetailCardTable } from '../../@types/components/infoCard/DetailCardTable';
import type { DetailCardEntry } from '../../@types/components/infoCard/DetailCardEntry';
import { SELECTION_KINDS } from '../../data/selection/selectionKinds';
import { layerUiContents } from '../../utils/layer/layerUiContents';
import GalaxyDetailCard from './GalaxyDetailCard/GalaxyDetailCard';
import BodyDetailCardContainer from '../containers/BodyDetailCardContainer';
import StructureDetailCardContainer from '../containers/StructureDetailCardContainer';
import StarDetailCard from './StarDetailCard/StarDetailCard';
import CompactCard from './CompactCard/CompactCard';
import CompactStructureCard from './CompactStructureCard/CompactStructureCard';
import CompactBodyCard from './CompactBodyCard/CompactBodyCard';
import CompactStarCard from './CompactStarCard/CompactStarCard';

/** The four focusable kinds core still owns outright — no Layer claims them.
 * `zoneOfAvoidance` and `milkyWay` are the arms missing here: they arrive via
 * `layerUiContents`, from their own Layer's `ui` entry. */
const CORE_DETAIL_CARDS: Partial<DetailCardTable> = {
  galaxyCatalog: {
    Detail: GalaxyDetailCard,
    Compact: CompactCard,
  },
  structure: {
    // Detail renders through a store container: the "N galaxies" figure is a
    // live-computed fact, not part of every arm's shared props (store-boundary
    // rule — same shape as the body arm below).
    Detail: StructureDetailCardContainer,
    Compact: CompactStructureCard,
  },
  body: {
    // Detail renders through a store container: a focused body's distance is
    // time-dependent, re-derived live off the throttled time pub, which a
    // presentational card cannot read (store-boundary rule).
    Detail: BodyDetailCardContainer,
    Compact: CompactBodyCard,
  },
  starCatalog: {
    Detail: StarDetailCard,
    Compact: CompactStarCard,
  },
};

/** Folds `CORE_DETAIL_CARDS` with every composed Layer's `detailCard` ui-slot
 * entry into the table InfoCard dispatches on. Throws if the composition
 * leaves any `SelectionKind` arm — core or Layer — unclaimed. */
export function detailCardTable(layers: readonly Layer<string, unknown>[]): DetailCardTable {
  const table: Partial<DetailCardTable> = { ...CORE_DETAIL_CARDS };
  for (const { type, ...entry } of layerUiContents(layers, 'detailCard')) {
    // TypeScript can't correlate a union-typed `type` with `entry`'s matching
    // arm across the fold, so the write goes through the widened record once.
    (table as Record<SelectionKind, DetailCardEntry>)[type] = entry as DetailCardEntry;
  }

  const missing = SELECTION_KINDS.filter((type) => table[type] === undefined);
  if (missing.length > 0) {
    throw new Error(`detailCardTable: no detailCard arm for "${missing.join(', ')}"`);
  }
  return table as DetailCardTable;
}
