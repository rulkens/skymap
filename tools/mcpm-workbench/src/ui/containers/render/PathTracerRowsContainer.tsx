/** PathTracerRowsContainer — store boundary for the path tracer's Rendering rows. */
import { memo, useCallback, type ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../../../../../src/@types/data/volume/ScalarFieldPaletteId';
import {
  setPathTracerCompressive,
  setPathTracerDivisor,
  setPathTracerPaletteId,
  setPathTracerParam,
  setPathTracerSampleCap,
} from '../../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import PathTracerRows, {
  type PathTracerRowsProps,
} from '../../render/PathTracerRows/PathTracerRows';

function PathTracerRowsContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const pathTracer = useAppSelector((s) => s.view.pathTracer);
  const onPaletteChange = useCallback(
    (id: ScalarFieldPaletteId) => dispatch(setPathTracerPaletteId(id)),
    [dispatch],
  );
  // The divisor and sample cap have their own setters; every other row is a keyed param.
  const onSliderChange = useCallback<PathTracerRowsProps['onSliderChange']>(
    (key, value) => {
      if (key === 'divisor') dispatch(setPathTracerDivisor(value));
      else if (key === 'sampleCap') dispatch(setPathTracerSampleCap(value));
      else dispatch(setPathTracerParam({ key, value }));
    },
    [dispatch],
  );
  const onCompressiveChange = useCallback(
    (on: boolean) => dispatch(setPathTracerCompressive(on)),
    [dispatch],
  );
  return (
    <PathTracerRows
      pathTracer={pathTracer}
      onPaletteChange={onPaletteChange}
      onSliderChange={onSliderChange}
      onCompressiveChange={onCompressiveChange}
    />
  );
}

export default memo(PathTracerRowsContainer);
