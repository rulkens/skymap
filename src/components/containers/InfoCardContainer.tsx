/**
 * InfoCardContainer — store boundary for the hover/selection detail card.
 *
 * Owns the selection reach (`selectHoveredFocusable`/`selectSelectedFocusable`)
 * and the focus/close dispatches, so the presentational `InfoCard` imports
 * nothing from `store/` or `state/`.
 */

import { memo, useCallback } from 'react';
import InfoCard from '../InfoCard/InfoCard';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectHoveredFocusable, selectSelectedFocusable } from '../../state/selection/selectors';
import { updateSelectionFocus, clearSelection } from '../../state/selection/selectionSlice';
import { refOf } from '../../services/engine/helpers/refOf';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';

function InfoCardContainer(): React.ReactElement {
  const dispatch = useAppDispatch();
  const hovered = useAppSelector(selectHoveredFocusable);
  const selected = useAppSelector(selectSelectedFocusable);

  const onFocus = useCallback(
    (target: FocusableTarget) => dispatch(updateSelectionFocus(refOf(target))),
    [dispatch],
  );
  const onClose = useCallback(() => dispatch(clearSelection()), [dispatch]);

  return <InfoCard hovered={hovered} selected={selected} onFocus={onFocus} onClose={onClose} />;
}

export default memo(InfoCardContainer);
