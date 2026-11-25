/**
 * HistogramReadout — the convergence readout (HistogramPlot + its jittered-
 * sampling toggle), in the data sidebar's pinned block so it stays visible
 * while the sections scroll.
 */
import { type ReactNode } from 'react';
import { setSampleRandomly } from '../../../state/histogram/histogramSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import HistogramPlot from '../HistogramPlot/HistogramPlot';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import styles from './HistogramReadout.module.css';

function HistogramReadout(): ReactNode {
  const dispatch = useAppDispatch();
  const sampleRandomly = useAppSelector((s) => s.histogram.sampleRandomly);

  return (
    <div className={styles.root}>
      <div className={styles.plot}>
        <HistogramPlot />
      </div>
      <ToggleRow
        label="jittered sampling"
        on={sampleRandomly}
        info="Samples the histogram at random positions instead of the catalog points themselves (the fork's HIST RNG SAMPLING toggle) — a coverage check, not the convergence signal itself."
        onChange={(on) => dispatch(setSampleRandomly(on))}
      />
    </div>
  );
}

export default HistogramReadout;
