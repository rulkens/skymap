/** FrameRateValue — the tip's frame-rate cell, in the icon's zone colour. */
import type { ReactNode } from 'react';
import type { FrameRateZone } from '../../../../../@types/sim/FrameRateZone';
import styles from '../SimulationTip.module.css';

export type FrameRateValueProps = {
  readonly zone: FrameRateZone;
  readonly text: string;
};

function FrameRateValue({ zone, text }: FrameRateValueProps): ReactNode {
  return (
    <span className={styles.value} data-zone={zone}>
      {text}
    </span>
  );
}

export default FrameRateValue;
