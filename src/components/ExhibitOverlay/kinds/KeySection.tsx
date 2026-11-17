/** KeySection — a colour-ramp legend: an exhibit's colours and what they measure. */

import type { ReactNode } from 'react';

import type { ExhibitKeySection } from '../../../@types/exhibits/ExhibitKeySection';
import styles from '../ExhibitOverlay.module.css';

export type KeySectionProps = {
  readonly data: ExhibitKeySection;
};

function KeySection({ data }: KeySectionProps): ReactNode {
  return (
    <div className={styles.section}>
      <h2 className={styles.blockLabel}>{data.heading}</h2>
      <div className={styles.key}>
        <div
          className={styles.ramp}
          style={{ backgroundImage: `linear-gradient(90deg, ${data.ramp.join(', ')})` }}
          aria-hidden="true"
        />
        <div className={styles.rampEnds} aria-hidden="true">
          {data.ends.map((end) => (
            <div key={end}>{end}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default KeySection;
