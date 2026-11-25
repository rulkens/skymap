/**
 * SimulationTip — the Simulation icon's tip: how the sim is doing and what it
 * runs on, as label/value rows. The same rows in every state, so the tip keeps
 * its size; the fast values are their own components, so a step or fps sample
 * re-renders one cell, and this table only on a grid or agent-count edit.
 */
import type { ReactNode } from 'react';
import { deriveGridBox } from '../../field/deriveGridBox';
import { useAppSelector } from '../../store/hooks';
import { formatAgentCount } from '../formatAgentCount';
import FrameRateValue from './FrameRateValue';
import StepCountValue from './StepCountValue';
import styles from './SimulationTip.module.css';

function SimulationTip(): ReactNode {
  const grid = useAppSelector((s) => s.grid);
  const agentCount = useAppSelector((s) => s.sim.agentCount);

  return (
    <span className={styles.root}>
      <span className={styles.label}>frame rate</span>
      <FrameRateValue />
      <span className={styles.label}>step</span>
      <StepCountValue />
      <span className={styles.label}>grid</span>
      <span className={styles.value}>{deriveGridBox(grid).dims.join(' × ')}</span>
      <span className={styles.label}>agents</span>
      <span className={styles.value}>{formatAgentCount(agentCount)}</span>
    </span>
  );
}

export default SimulationTip;
