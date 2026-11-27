/** HistogramPlotContainer — store boundary for the convergence plot: the histogram slice, per sample. */
import { memo, type ReactNode } from 'react';
import { useAppSelector } from '../../../store/hooks';
import HistogramPlot from '../../sim/HistogramPlot/HistogramPlot';

function HistogramPlotContainer(): ReactNode {
  const histogram = useAppSelector((s) => s.histogram);
  return <HistogramPlot histogram={histogram} />;
}

export default memo(HistogramPlotContainer);
