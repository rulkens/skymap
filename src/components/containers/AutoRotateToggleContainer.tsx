// src/components/containers/AutoRotateToggleContainer.tsx
/**
 * AutoRotateToggleContainer — store boundary for the auto-rotate pill.
 *
 * Owns the `selectAutoRotate` read and the `setAutoRotate` dispatch so the
 * presentational `AutoRotateToggle` imports nothing from `store/` or `state/`.
 * A store change re-renders only this subtree rather than the entire App; `memo`
 * cuts the parent-cascade direction (App re-rendering on a `paletteOpen` change
 * must not re-render this component when `autoRotate` and `hidden` are unchanged).
 *
 * `hidden` is passed in: it derives from `paletteOpen || splashVisible`, which is
 * App-layout state App owns — not this container's to subscribe to.
 */

import { memo, useCallback } from 'react';
import AutoRotateToggle from '../AutoRotateToggle/AutoRotateToggle';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectAutoRotate, selectAutoRotateRate } from '../../state/camera/selectors';
import { setAutoRotate } from '../../state/camera/cameraSlice';

function AutoRotateToggleContainer({ hidden }: { hidden: boolean }): React.ReactElement {
  const autoRotate = useAppSelector(selectAutoRotate);
  // The slice replaces the whole `{ active, rate }` sub-object, so the toggle
  // carries the current rate forward unchanged while flipping `active`.
  const rate = useAppSelector(selectAutoRotateRate);
  const dispatch = useAppDispatch();
  const onToggle = useCallback(
    () => dispatch(setAutoRotate({ active: !autoRotate, rate })),
    [dispatch, autoRotate, rate],
  );
  return <AutoRotateToggle playing={autoRotate} onToggle={onToggle} hidden={hidden} />;
}

export default memo(AutoRotateToggleContainer);
