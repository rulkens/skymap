/** StepCountValue — the tip's step cell, as Stats shows it; the only part that re-renders per step. */
import type { ReactNode } from 'react';
import { useAppSelector } from '../../../../store/hooks';
import styles from '../SimulationTip.module.css';

function StepCountValue(): ReactNode {
  const stepCount = useAppSelector((s) => s.sim.stepCount);
  return <span className={styles.value}>{stepCount.toLocaleString()}</span>;
}

export default StepCountValue;
