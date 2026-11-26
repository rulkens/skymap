/**
 * HistogramPlot — the live convergence readout: the fork's 16 count bins as
 * bars with each bin's decade beneath, and `meanLogTraceAtPoints`'s history
 * stroked over them on its own vertical scale. Bin 16 is the running
 * `atomicMax(1e5 * density)` marker, not a count, so it surfaces only in the
 * 'M' readout. Bars and labels are DOM on one grid (subgrid rows), so they
 * cannot drift apart; the canvas draws only the line, redrawn when the
 * histogram changes or its box resizes, so it never stays stretched.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import CompactInfoTip from '../../../../../../src/components/common/CompactInfoTip/CompactInfoTip';
import type { HistogramSlice } from '../../../../@types/sim/HistogramSlice';
import { barFractions } from './utils/barFractions';
import { binLabel } from './utils/binLabel';
import { COUNT_BIN_COUNT } from './data/countBinCount.constant';
import { drawHistoryLine } from './utils/drawHistoryLine';
import { READOUT_TIPS } from './data/readoutTips.constant';
import { readoutLinesFor } from './utils/readoutLinesFor';
import styles from './HistogramPlot.module.css';

export type HistogramPlotProps = {
  readonly histogram: HistogramSlice;
};

function HistogramPlot({ histogram }: HistogramPlotProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutLines = readoutLinesFor(histogram.counts, histogram.meanLogTraceAtPoints);
  const fractions = barFractions(histogram.counts);

  // The observer's first callback, on observe, is the draw for this sample.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const history = histogram.history.map((sample) => sample.meanLogTraceAtPoints);
    const observer = new ResizeObserver(() => drawHistoryLine(canvas, history));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [histogram]);

  return (
    <div className={styles.root} style={{ '--bin-count': COUNT_BIN_COUNT } as CSSProperties}>
      <div className={styles.readout}>
        {readoutLines.map((line, i) => (
          <CompactInfoTip
            key={READOUT_TIPS[i]}
            label={READOUT_TIPS[i]}
            align={i < readoutLines.length / 2 ? 'start' : 'end'}
          >
            <span className={i === 0 ? styles.readoutEmphasis : styles.readoutRow}>{line}</span>
          </CompactInfoTip>
        ))}
      </div>
      <div className={styles.bars} aria-hidden>
        {fractions.map((fraction, bin) => (
          <span key={bin} className={styles.bar} style={{ '--fill': fraction } as CSSProperties} />
        ))}
      </div>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden />
      <div className={styles.labels}>
        {fractions.map((_, bin) => (
          <span key={bin} className={styles.label}>
            {binLabel(bin)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default HistogramPlot;
