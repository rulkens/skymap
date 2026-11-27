/** HistogramReadoutContainer — store boundary for the convergence readout's jittered-sampling toggle. */
import { memo, useCallback, type ReactNode } from 'react';
import { setSampleRandomly } from '../../../state/histogram/histogramSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import HistogramReadout from '../../sim/HistogramReadout/HistogramReadout';

function HistogramReadoutContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const sampleRandomly = useAppSelector((s) => s.histogram.sampleRandomly);
  const onSampleRandomlyChange = useCallback(
    (on: boolean) => dispatch(setSampleRandomly(on)),
    [dispatch],
  );
  return (
    <HistogramReadout
      sampleRandomly={sampleRandomly}
      onSampleRandomlyChange={onSampleRandomlyChange}
    />
  );
}

export default memo(HistogramReadoutContainer);
