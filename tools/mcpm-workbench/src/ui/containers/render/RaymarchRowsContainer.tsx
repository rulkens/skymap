/** RaymarchRowsContainer — store boundary for the raymarch's Rendering rows. */
import { memo, useCallback, type ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../../../../../packages/shared/src/@types/data/volume/ScalarFieldPaletteId';
import {
  setAdditive,
  setDivisor,
  setPreviewPacked,
  setRaymarchPaletteId,
  setRaymarchParam,
} from '../../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import RaymarchRows, { type RaymarchRowsProps } from '../../render/RaymarchRows/RaymarchRows';

function RaymarchRowsContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const raymarch = useAppSelector((s) => s.view.raymarch);
  const onAdditiveChange = useCallback((on: boolean) => dispatch(setAdditive(on)), [dispatch]);
  const onPreviewPackedChange = useCallback(
    (on: boolean) => dispatch(setPreviewPacked(on)),
    [dispatch],
  );
  const onPaletteChange = useCallback(
    (id: ScalarFieldPaletteId) => dispatch(setRaymarchPaletteId(id)),
    [dispatch],
  );
  // The divisor has its own setter; every other row is a keyed param.
  const onSliderChange = useCallback<RaymarchRowsProps['onSliderChange']>(
    (key, value) =>
      dispatch(key === 'divisor' ? setDivisor(value) : setRaymarchParam({ key, value })),
    [dispatch],
  );
  return (
    <RaymarchRows
      raymarch={raymarch}
      onAdditiveChange={onAdditiveChange}
      onPreviewPackedChange={onPreviewPackedChange}
      onPaletteChange={onPaletteChange}
      onSliderChange={onSliderChange}
    />
  );
}

export default memo(RaymarchRowsContainer);
