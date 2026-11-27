/**
 * SimulationTip — the Simulation icon's tip: how the sim is doing and what it
 * runs on, as label/value rows. The same rows in every state, so the tip keeps
 * its size; the fast values are their own containers, so a step or fps sample
 * re-renders one cell, and this table only on a grid or agent-count edit.
 */
import type { ReactNode } from 'react';
import type { Vec3 } from '../../../../../shared/src/@types/math/Vec3';
import { formatAgentCount } from '../../../utils/format/formatAgentCount';
import FrameRateValueContainer from '../../containers/sim/FrameRateValueContainer';
import StepCountValueContainer from '../../containers/sim/StepCountValueContainer';
import styles from './SimulationTip.module.css';

export type SimulationTipProps = {
  readonly gridDims: Vec3;
  readonly agentCount: number;
};

function SimulationTip({ gridDims, agentCount }: SimulationTipProps): ReactNode {
  return (
    <span className={styles.root}>
      <span className={styles.label}>frame rate</span>
      <FrameRateValueContainer />
      <span className={styles.label}>step</span>
      <StepCountValueContainer />
      <span className={styles.label}>grid</span>
      <span className={styles.value}>{gridDims.join(' × ')}</span>
      <span className={styles.label}>agents</span>
      <span className={styles.value}>{formatAgentCount(agentCount)}</span>
    </span>
  );
}

export default SimulationTip;
