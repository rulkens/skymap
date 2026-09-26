/**
 * detailCardTable — folds core's four FocusableTarget arms with every Layer's
 * `detailCard` ui-slot contribution into the `DetailCardTable` InfoCard
 * dispatches on. Called once at module load (`InfoCard.tsx`), so a missing arm
 * throws at boot naming the union member nobody claimed — a composition
 * wiring bug, not one to surface per-render.
 *
 * Each core entry renders its arm's cards straight from `target` — the table
 * key is the narrowing proof, so no entry re-checks `target.type` —
 * `GalaxyDetailCard` / `CompactCard` for a galaxy, `StructureDetailCard` /
 * `CompactStructureCard` for a structure. The structure `Detail` threads the
 * structure-only `selectedMemberCount` through; the other core arms ignore it.
 *
 * Dispatching on `target.type` through a `DetailCardTable` follows the
 * simplicity convention's table-dispatch rule (item 7): a new focusable kind
 * adds one Layer `ui` entry instead of a render branch in InfoCard. InfoCard
 * keeps the outer-wrapper-stable contract and the
 * hover/pinned stacking around this lookup; the table only decides which card
 * a given target renders as.
 *
 * Each entry returns a bare card element with no wrapper of its own, so it
 * drops straight into InfoCard's existing single-wrapper layout (the stable
 * outer 'div' that keeps the native 'details' open-state alive across hover ↔
 * pin transitions).
 *
 * Built with `createElement` rather than JSX so the table stays a plain '.ts'
 * module sitting next to the data-flow code it dispatches, not a component file.
 */

import { createElement } from 'react';
import type { Layer } from '../../@types/engine/layer/Layer';
import type { SelectionKind } from '../../@types/engine/SelectionKind';
import type { DetailCardTable } from '../../@types/components/infoCard/DetailCardTable';
import type { DetailCardEntry } from '../../@types/components/infoCard/DetailCardEntry';
import { SELECTION_KINDS } from '../../data/selection/selectionKinds';
import { layerUiContents } from '../../utils/layer/layerUiContents';
import GalaxyDetailCard from './GalaxyDetailCard/GalaxyDetailCard';
import StructureDetailCard from './StructureDetailCard/StructureDetailCard';
import BodyDetailCardContainer from '../containers/BodyDetailCardContainer';
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
    Detail: ({ target, pinned, chrome, onFocus, onClose }) =>
      createElement(GalaxyDetailCard, {
        info: target,
        pinned,
        chrome,
        onFocus: pinned ? onFocus : undefined,
        onClose: pinned ? onClose : undefined,
      }),
    Compact: ({ target }) => createElement(CompactCard, { info: target }),
  },
  structure: {
    Detail: ({ target, pinned, selectedMemberCount, chrome, onFocus, onClose }) =>
      createElement(StructureDetailCard, {
        structure: target,
        pinned,
        memberCount: selectedMemberCount,
        chrome,
        onFocus,
        onClose,
      }),
    Compact: ({ target }) => createElement(CompactStructureCard, { structure: target }),
  },
  body: {
    // The body arm renders through a store container: a focused body's distance
    // is time-dependent and re-derived live off the throttled time pub, which a
    // presentational card cannot read (store-boundary rule). The container reads
    // it and passes it as a prop; identity rows stay on the pure card.
    Detail: ({ target, pinned, chrome, onFocus, onClose }) =>
      createElement(BodyDetailCardContainer, {
        target,
        pinned,
        chrome,
        onFocus,
        onClose,
      }),
    Compact: ({ target }) => createElement(CompactBodyCard, { target }),
  },
  starCatalog: {
    Detail: ({ target, pinned, chrome, onFocus, onClose }) =>
      createElement(StarDetailCard, {
        target,
        pinned,
        chrome,
        onFocus,
        onClose,
      }),
    Compact: ({ target }) => createElement(CompactStarCard, { info: target }),
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
