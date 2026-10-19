/** VoyageReadouts — the trip's figures under a hairline, as the facts block sits: Earth's clock, speed, γ, the distance ahead. */

import type { ReactNode } from 'react';

import type { VoyageReadouts as Readouts } from '../@types/VoyageReadouts';
import styles from './Voyage.module.css';

export type VoyageReadoutsProps = {
  readonly readouts: Readouts;
};

function VoyageReadouts({ readouts }: VoyageReadoutsProps): ReactNode {
  const rows = [
    { label: 'Earth’s clock', value: readouts.earthClock },
    { label: 'Speed', value: readouts.speed },
    { label: 'Lorentz factor γ', value: readouts.gamma },
    { label: 'Ahead, Earth’s measure', value: readouts.aheadEarthLy },
    { label: 'Ahead, ship’s measure', value: readouts.aheadShipLy },
  ];
  return (
    <dl className={styles.readouts}>
      {rows.map((row) => (
        <div key={row.label} className={styles.readout}>
          <dt className={styles.readoutLabel}>{row.label}</dt>
          <dd className={styles.readoutValue}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default VoyageReadouts;
