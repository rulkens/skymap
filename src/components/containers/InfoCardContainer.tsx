/**
 * InfoCardContainer — store boundary for the hover/selection detail card.
 *
 * Owns the selection reach (`selectHoveredFocusable`/`selectSelectedFocusable`)
 * and the focus/close dispatches, so the presentational `InfoCard` imports
 * nothing from `store/` or `state/`.
 */

import { memo, useCallback, useRef } from 'react';
import InfoCard from '../InfoCard/InfoCard';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useViewCoverRow } from '../../hooks/useViewCoverRow';
import { selectUiStackHidden } from '../../state/ui/selectors';
import { selectHoveredFocusable, selectSelectedFocusable } from '../../state/selection/selectors';
import { updateSelectionFocus, clearSelection } from '../../state/selection/selectionSlice';
import type { FocusableTargetBase } from '../../@types/engine/selection/FocusableTargetBase';

function InfoCardContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const hovered = useAppSelector(selectHoveredFocusable);
  const selected = useAppSelector(selectSelectedFocusable);
  const uiStackHidden = useAppSelector(selectUiStackHidden);
  const isMobile = useIsMobile();
  // The pinned card only: a hover preview comes and goes with the cursor.
  const rootRef = useRef<HTMLDivElement>(null);
  useViewCoverRow(rootRef, 'infoCard', 'right', !isMobile && !uiStackHidden && selected !== null);

  const onFocus = useCallback(
    (target: FocusableTargetBase) => dispatch(updateSelectionFocus(target.ref)),
    [dispatch],
  );
  const onClose = useCallback(() => dispatch(clearSelection()), [dispatch]);

  return (
    <InfoCard
      ref={rootRef}
      hovered={hovered}
      selected={selected}
      onFocus={onFocus}
      onClose={onClose}
    />
  );
}

export default memo(InfoCardContainer);
