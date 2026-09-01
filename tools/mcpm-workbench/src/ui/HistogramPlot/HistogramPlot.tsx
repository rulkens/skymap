/**
 * HistogramPlot — the live convergence readout (task T20): the fork's 17-bin
 * density histogram as bars, plus `meanLogTraceAtPoints`'s time series as a
 * line beneath it. A small canvas, redrawn only when `histogram` changes —
 * watchHistogramSaga already throttles how often that is (HISTOGRAM_INTERVAL_STEPS).
 *
 * Bin 16 (constants.wesl's `N_HISTOGRAM_BINS - 1`) is not a count — it's the
 * running `atomicMax(1e5 * density)` marker — so only bins 0..15 draw as
 * bars; its value surfaces in the 'M' readout instead (S13, below).
 *
 * S13 fork parity (vendor main.cpp:1589-1622): the four info labels —
 * E (mean), M (top-bin marker), null% and the log base — sit right-aligned
 * beside the bars. They render as absolutely-positioned DOM rows (so each
 * carries a CompactInfoTip hover) but `draw()` still measures the SAME
 * strings with the canvas's own font to reserve the bars' strip width —
 * right alignment keeps a value's width change from nudging anything else
 * (the brief's "no layout jump") in both coordinate spaces.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import CompactInfoTip from '../../../../../src/components/common/CompactInfoTip/CompactInfoTip';
import { useAppSelector } from '../../store/hooks';
import { draw } from './utils/draw';
import { READOUT_TIPS } from './utils/READOUT_TIPS';
import { readoutLinesFor } from './utils/readoutLinesFor';
import styles from './HistogramPlot.module.css';

function HistogramPlot(): ReactNode {
  const histogram = useAppSelector((s) => s.histogram);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutLines = readoutLinesFor(histogram.counts, histogram.meanLogTraceAtPoints);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(
      canvas,
      histogram.counts,
      histogram.history.map((sample) => sample.meanLogTraceAtPoints),
      readoutLinesFor(histogram.counts, histogram.meanLogTraceAtPoints),
    );
  }, [histogram]);

  return (
    <div className={styles.root}>
      <div className={styles.canvasBox}>
        <canvas ref={canvasRef} className={styles.canvas} />
        <div className={styles.readout}>
          {readoutLines.map((line, i) => (
            <CompactInfoTip key={READOUT_TIPS[i]} label={READOUT_TIPS[i]} align="end">
              <span className={i === 0 ? styles.readoutEmphasis : styles.readoutRow}>{line}</span>
            </CompactInfoTip>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HistogramPlot;
