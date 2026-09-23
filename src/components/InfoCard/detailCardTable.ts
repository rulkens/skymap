/**
 * detailCardTable — folds core's five FocusableTarget arms with every Layer's
 * `detailCard` ui-slot contribution into the `Record<FocusableTargetType, …>`
 * InfoCard dispatches on. Called once at module load (`InfoCard.tsx`), so a
 * missing arm throws at boot naming the union member nobody claimed — a
 * composition wiring bug, not one to surface per-render.
 *
 * Each core entry narrows `target` via `target.type` (no cast) and renders
 * that arm's cards — `GalaxyDetailCard` / `CompactCard` for a galaxy,
 * `StructureDetailCard` / `CompactStructureCard` for a structure. The
 * structure `Detail` threads the structure-only `selectedMemberCount` through;
 * the other core arms ignore it.
 *
 * Dispatching on `target.type` through a `Record<FocusableTargetType, …>`
 * table follows the simplicity convention's table-dispatch rule (item 7): a
 * new focusable kind adds one Layer `ui` entry instead of a render branch in
 * InfoCard. InfoCard keeps the outer-wrapper-stable contract and the
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
import type { FocusableTargetType } from '../../@types/engine/FocusableTargetType';
import type { DetailCardEntry } from '../../@types/components/infoCard/DetailCardEntry';
import { layerUiContents } from '../../utils/layer/layerUiContents';
import GalaxyDetailCard from './GalaxyDetailCard/GalaxyDetailCard';
import StructureDetailCard from './StructureDetailCard/StructureDetailCard';
import MilkyWayDetailCard from './MilkyWayDetailCard/MilkyWayDetailCard';
import BodyDetailCardContainer from '../containers/BodyDetailCardContainer';
import StarDetailCard from './StarDetailCard/StarDetailCard';
import CompactCard from './CompactCard/CompactCard';
import CompactStructureCard from './CompactStructureCard/CompactStructureCard';
import CompactMilkyWayCard from './CompactMilkyWayCard/CompactMilkyWayCard';
import CompactBodyCard from './CompactBodyCard/CompactBodyCard';
import CompactStarCard from './CompactStarCard/CompactStarCard';

/** The five focusable kinds core still owns outright — no Layer claims them.
 * `zoneOfAvoidance` is the one arm missing here: it arrives via
 * `layerUiContents`, from the zoneOfAvoidance Layer's own `ui` entry. */
const CORE_DETAIL_CARDS: Partial<Record<FocusableTargetType, DetailCardEntry>> = {
  galaxyCatalog: {
    Detail: ({ target, pinned, chrome, onFocus, onClose }) => {
      if (target.type !== 'galaxyCatalog') return null;
      return createElement(GalaxyDetailCard, {
        info: target,
        pinned,
        chrome,
        onFocus: pinned ? onFocus : undefined,
        onClose: pinned ? onClose : undefined,
      });
    },
    Compact: ({ target }) =>
      target.type === 'galaxyCatalog' ? createElement(CompactCard, { info: target }) : null,
  },
  structure: {
    Detail: ({ target, pinned, selectedMemberCount, chrome, onFocus, onClose }) => {
      if (target.type !== 'structure') return null;
      return createElement(StructureDetailCard, {
        structure: target,
        pinned,
        memberCount: selectedMemberCount,
        chrome,
        onFocus,
        onClose,
      });
    },
    Compact: ({ target }) =>
      target.type === 'structure'
        ? createElement(CompactStructureCard, { structure: target })
        : null,
  },
  milkyWay: {
    Detail: ({ target, pinned, chrome, onFocus, onClose }) => {
      if (target.type !== 'milkyWay') return null;
      return createElement(MilkyWayDetailCard, {
        target,
        pinned,
        chrome,
        onFocus,
        onClose,
      });
    },
    Compact: ({ target }) =>
      target.type === 'milkyWay' ? createElement(CompactMilkyWayCard, { target }) : null,
  },
  body: {
    // The body arm renders through a store container: a focused body's distance
    // is time-dependent and re-derived live off the throttled time pub, which a
    // presentational card cannot read (store-boundary rule). The container reads
    // it and passes it as a prop; identity rows stay on the pure card.
    Detail: ({ target, pinned, chrome, onFocus, onClose }) => {
      if (target.type !== 'body') return null;
      return createElement(BodyDetailCardContainer, {
        target,
        pinned,
        chrome,
        onFocus,
        onClose,
      });
    },
    Compact: ({ target }) =>
      target.type === 'body' ? createElement(CompactBodyCard, { target }) : null,
  },
  starCatalog: {
    Detail: ({ target, pinned, chrome, onFocus, onClose }) => {
      if (target.type !== 'starCatalog') return null;
      return createElement(StarDetailCard, {
        target,
        pinned,
        chrome,
        onFocus,
        onClose,
      });
    },
    Compact: ({ target }) =>
      target.type === 'starCatalog' ? createElement(CompactStarCard, { info: target }) : null,
  },
};

/** The full `FocusableTargetType` union has no runtime enumeration (it's a
 * derived string-literal type), so this is the one place that spells its
 * members out — to check the fold below is total. A new arm widens
 * `FocusableTarget` and must be added here too, or `detailCardTable` throws
 * at boot for every composition that doesn't also add the matching `ui` row. */
const FOCUSABLE_TARGET_TYPES: readonly FocusableTargetType[] = [
  'galaxyCatalog',
  'structure',
  'milkyWay',
  'zoneOfAvoidance',
  'body',
  'starCatalog',
];

/** Folds `CORE_DETAIL_CARDS` with every composed Layer's `detailCard` ui-slot
 * entry into the table InfoCard dispatches on. Throws if the composition
 * leaves any `FocusableTargetType` arm — core or Layer — unclaimed. */
export function detailCardTable(
  layers: readonly Layer<string, unknown>[],
): Record<FocusableTargetType, DetailCardEntry> {
  const table: Partial<Record<FocusableTargetType, DetailCardEntry>> = { ...CORE_DETAIL_CARDS };
  for (const { type, ...entry } of layerUiContents(layers, 'detailCard')) {
    table[type] = entry;
  }

  const missing = FOCUSABLE_TARGET_TYPES.filter((type) => table[type] === undefined);
  if (missing.length > 0) {
    throw new Error(`detailCardTable: no detailCard arm for "${missing.join(', ')}"`);
  }
  return table as Record<FocusableTargetType, DetailCardEntry>;
}
