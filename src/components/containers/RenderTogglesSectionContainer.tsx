// src/components/containers/RenderTogglesSectionContainer.tsx
/**
 * RenderTogglesSectionContainer — store boundary for the per-pass renderer
 * toggle list. `passNames` is handle-bound (sourced from the engine via
 * App → DebugPanel), not store state, so it stays a prop rather than a
 * selector read.
 *
 * `onTogglePass` reads `disabledPasses[pass]` in its body, so its
 * `useCallback` dep array is `[dispatch, disabledPasses]` — NOT the
 * `[dispatch]`-only pattern used elsewhere. This preserves the existing
 * `disabled: disabledPasses[pass] !== true` toggle semantics exactly.
 */

import { memo, useCallback } from 'react';
import { RenderTogglesSection } from '../DebugPanel/RenderTogglesSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectDisabledPasses } from '../../state/settings/selectors';
import { setPassDisabled } from '../../state/settings/settingsSlice';

export type RenderTogglesSectionContainerProps = {
  /** Pass names in draw order, sourced from the engine handle's `passOverrides.allNames`. */
  passNames: readonly string[];
};

function RenderTogglesSectionContainer({
  passNames,
}: RenderTogglesSectionContainerProps): React.ReactElement {
  const dispatch = useAppDispatch();
  const disabledPasses = useAppSelector(selectDisabledPasses);

  // Reads `disabledPasses[pass]` in its body — dep array includes `disabledPasses`
  // so the callback captures the current record on each store update.
  const onTogglePass = useCallback(
    (pass: string) => dispatch(setPassDisabled({ pass, disabled: disabledPasses[pass] !== true })),
    [dispatch, disabledPasses],
  );

  return (
    <RenderTogglesSection
      passNames={passNames}
      disabledPasses={disabledPasses}
      onTogglePass={onTogglePass}
    />
  );
}

export default memo(RenderTogglesSectionContainer);
