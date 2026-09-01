/**
 * HistogramDock — the convergence readout (HistogramPlot + its jittered-
 * sampling toggle), floated bottom-left over the viewport instead of living
 * in the sidebar, so it stays visible while the sidebar scrolls elsewhere.
 */
import { type ReactNode } from 'react';
import { setSampleRandomly } from '../../state/slices/histogramSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import HistogramPlot from '../HistogramPlot/HistogramPlot';
import ToggleRow from '../ToggleRow/ToggleRow';
import styles from './HistogramDock.module.css';

function HistogramDock(): ReactNode {
  const dispatch = useAppDispatch();
  const sampleRandomly = useAppSelector((s) => s.histogram.sampleRandomly);

  return (
    <div className={styles.root}>
      <div className={styles.eyebrow}>HISTOGRAM</div>
      <HistogramPlot />
      <ToggleRow
        label="jittered sampling"
        on={sampleRandomly}
        info="Samples the histogram at random positions instead of the catalog points themselves (the fork's HIST RNG SAMPLING toggle) — a coverage check, not the convergence signal itself."
        onChange={(on) => dispatch(setSampleRandomly(on))}
      />
    </div>
  );
}

export default HistogramDock;
