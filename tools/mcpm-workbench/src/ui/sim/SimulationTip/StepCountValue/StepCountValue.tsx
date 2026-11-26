/** StepCountValue — the tip's step cell, as Stats shows it. */
import type { ReactNode } from 'react';
import styles from '../SimulationTip.module.css';

export type StepCountValueProps = {
  readonly stepCount: number;
};

function StepCountValue({ stepCount }: StepCountValueProps): ReactNode {
  return <span className={styles.value}>{stepCount.toLocaleString()}</span>;
}

export default StepCountValue;
