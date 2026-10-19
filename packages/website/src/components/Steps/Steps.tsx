/*
 * Steps — a numbered procedure, its steps side by side on the page grid when
 * wide and stacked when narrow. Each child is a Step, which takes its number
 * from the counter this list starts. Three columns, unless `count` says four
 * for a row of short steps: Step then sets its numeral large (the `--numeral-*`
 * properties below), and the row folds to two columns, then one.
 */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './Steps.module.css';

type StepsProps = { count?: 4; children: ReactNode };

function Steps({ count, children }: StepsProps) {
  return <ol className={cx(styles.root, count ? styles.fixed : styles.thirds)}>{children}</ol>;
}

export default Steps;
