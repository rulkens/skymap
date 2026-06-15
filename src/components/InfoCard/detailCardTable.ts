/**
 * DETAIL_CARD — table dispatch for InfoCard's detail + compact card variants
 * over the FocusableTarget union, keyed on the union tag `target.type`.
 *
 * Each row owns one focusable arm: it narrows `target` via `target.type` (no
 * cast) and renders that arm's cards — `GalaxyDetailCard` / `CompactCard` for a
 * galaxy, `StructureDetailCard` / `CompactStructureCard` for a structure. The
 * structure `Detail` threads the structure-only `selectedMemberCount` through;
 * the galaxy `Detail` ignores it (its card has no member-count row).
 *
 * Dispatching on `target.type` through a `Record<FocusableTargetType, …>` table
 * follows the simplicity convention's table-dispatch rule (item 7): a new
 * focusable kind adds one row here instead of editing every render branch in
 * InfoCard. InfoCard keeps the outer-wrapper-stable contract and the
 * hover/pinned stacking around these lookups; the table only decides which card
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

import { createElement, type ReactNode } from 'react';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import type { FocusableTargetType } from '../../@types/engine/FocusableTargetType';
import { GalaxyDetailCard } from './GalaxyDetailCard';
import { StructureDetailCard } from './StructureDetailCard';
import { CompactCard } from './CompactCard';
import { CompactStructureCard } from './CompactStructureCard';

/** Props InfoCard passes to a detail-card variant, identical across arms. */
export type DetailCardProps = {
  target: FocusableTarget;
  pinned: boolean;
  /**
   * Catalogued galaxy count for a pinned structure, or null/undefined when not
   * applicable. Consumed by the structure arm; the galaxy arm ignores it.
   */
  selectedMemberCount?: number | null;
  onFocus?: (target: FocusableTarget) => void;
  onClose?: () => void;
};

/** Props InfoCard passes to a compact (hover-preview) variant. */
export type CompactCardProps = { target: FocusableTarget };

export type DetailCardEntry = {
  readonly Detail: (props: DetailCardProps) => ReactNode;
  readonly Compact: (props: CompactCardProps) => ReactNode;
};

export const DETAIL_CARD: Record<FocusableTargetType, DetailCardEntry> = {
  galaxyCatalog: {
    Detail: ({ target, pinned, onFocus, onClose }) => {
      if (target.type !== 'galaxyCatalog') return null;
      return createElement(GalaxyDetailCard, {
        info: target,
        pinned,
        onFocus: pinned ? onFocus : undefined,
        onClose: pinned ? onClose : undefined,
      });
    },
    Compact: ({ target }) =>
      target.type === 'galaxyCatalog' ? createElement(CompactCard, { info: target }) : null,
  },
  structure: {
    Detail: ({ target, pinned, selectedMemberCount, onFocus, onClose }) => {
      if (target.type !== 'structure') return null;
      return createElement(StructureDetailCard, {
        structure: target,
        pinned,
        memberCount: selectedMemberCount,
        onFocus,
        onClose,
      });
    },
    Compact: ({ target }) =>
      target.type === 'structure'
        ? createElement(CompactStructureCard, { structure: target })
        : null,
  },
};
