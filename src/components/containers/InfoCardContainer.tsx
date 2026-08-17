// src/components/containers/InfoCardContainer.tsx
/**
 * InfoCardContainer — store boundary for the hover/selection detail card.
 *
 * Owns the selection reach (`selectHoveredFocusable`/`selectSelectedFocusable`),
 * the settings/tier reach that feeds the live member-count derivation
 * (`selectVisibleSourceMask`/`selectTier` via `useStructureMemberCount`), and
 * the focus/close dispatches, so the presentational `InfoCard` imports
 * nothing from `store/` or `state/`. The engine handle is a ref, not store
 * state — the caller (App) still owns and passes it in.
 */

import { memo, useCallback } from 'react';
import type { RefObject } from 'react';
import InfoCard from '../InfoCard/InfoCard';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectHoveredFocusable, selectSelectedFocusable } from '../../state/selection/selectors';
import { selectVisibleSourceMask } from '../../state/settings/selectors';
import { selectTier } from '../../state/tier/selectors';
import { updateSelectionFocus, clearSelection } from '../../state/selection/selectionSlice';
import { refOf } from '../../services/engine/helpers/refOf';
import { useStructureMemberCount } from '../../hooks/useStructureMemberCount';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';

export type InfoCardContainerProps = {
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

function InfoCardContainer({ engineHandleRef }: InfoCardContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const hovered = useAppSelector(selectHoveredFocusable);
  const selected = useAppSelector(selectSelectedFocusable);
  const visibleSourceMask = useAppSelector(selectVisibleSourceMask);
  const currentTier = useAppSelector(selectTier);

  const selectedMemberCount = useStructureMemberCount({
    selected,
    engineHandleRef,
    tier: currentTier,
    visibleSourceMask,
  });

  const onFocus = useCallback(
    (target: FocusableTarget) => dispatch(updateSelectionFocus(refOf(target))),
    [dispatch],
  );
  const onClose = useCallback(() => dispatch(clearSelection()), [dispatch]);

  return (
    <InfoCard
      hovered={hovered}
      selected={selected}
      selectedMemberCount={selectedMemberCount}
      onFocus={onFocus}
      onClose={onClose}
    />
  );
}

export default memo(InfoCardContainer);
