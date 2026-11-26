/**
 * HistogramReadout — the convergence readout (HistogramPlot + its jittered-
 * sampling toggle), in the data sidebar's pinned block so it stays visible
 * while the sections scroll.
 */
import { type ReactNode } from 'react';
import HistogramPlotContainer from '../../containers/sim/HistogramPlotContainer';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import styles from './HistogramReadout.module.css';

export type HistogramReadoutProps = {
  readonly sampleRandomly: boolean;
  readonly onSampleRandomlyChange: (on: boolean) => void;
};

function HistogramReadout({
  sampleRandomly,
  onSampleRandomlyChange,
}: HistogramReadoutProps): ReactNode {
  return (
    <div className={styles.root}>
      <div className={styles.plot}>
        <HistogramPlotContainer />
      </div>
      <ToggleRow
        label="jittered sampling"
        on={sampleRandomly}
        info="Samples the histogram at random positions instead of the catalog points themselves (the fork's HIST RNG SAMPLING toggle) — a coverage check, not the convergence signal itself."
        onChange={onSampleRandomlyChange}
      />
    </div>
  );
}

export default HistogramReadout;
