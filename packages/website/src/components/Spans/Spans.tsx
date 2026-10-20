/*
 * Spans — `<Spans ticks={[…]} spans={[…]} />` on a docs page: stretches of
 * one scale, each a line on a common axis with a ring at each end, its name
 * and a sentence under it. `from`, `to` and a tick's `at` are in the axis's
 * own units (powers of ten on a logarithmic one); a span with no `to` has no
 * end: it runs off the edge dashed, and the label under the scale says so.
 * The children are the rest of that label. The words are text, not part of the
 * drawing, so they keep the page's sizes at every width.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './Spans.module.css';

type SpansProps = {
  label: string;
  min: number;
  max: number;
  ticks: readonly { at: number; label: string }[];
  spans: readonly { name: string; text: string; from: number; to?: number }[];
  children?: ReactNode;
};

// Where an endless span turns from a line into dashes.
const OPEN_FROM = 88;

function Spans({ label, min, max, ticks, spans, children }: SpansProps) {
  const x = (value: number) => ((value - min) / (max - min)) * 100;
  // A phone has room for three marks: the two ends of the scale and the one nearest its middle.
  const middle = Math.floor((ticks.length - 1) / 2);
  const open = spans.some((span) => span.to === undefined);
  return (
    <figure className={styles.root} data-embed role="group" aria-label={label}>
      <ol className={styles.bare}>
        {spans.map((span) => (
          <li key={span.name}>
            <div className={styles.axis} aria-hidden="true">
              <i
                className={styles.bar}
                style={{
                  left: `${x(span.from)}%`,
                  right: `${100 - (span.to === undefined ? OPEN_FROM : x(span.to))}%`,
                }}
              />
              {span.to === undefined && (
                <i
                  className={cx(styles.bar, styles.open)}
                  style={{ left: `${OPEN_FROM}%`, right: 0 }}
                />
              )}
            </div>
            <b>{span.name}</b>
            <span className={styles.text}>{span.text}</span>
          </li>
        ))}
      </ol>
      <div className={styles.ticks} aria-hidden="true">
        {ticks.map((tick, i) => (
          <span
            key={tick.at}
            className={cx(i === middle && styles.middle)}
            style={{ left: `${x(tick.at)}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      {(open || children) && (
        <figcaption className={styles.caption}>
          {children}
          {open && ' A dashed end has no far limit.'}
        </figcaption>
      )}
    </figure>
  );
}

export default Spans;
