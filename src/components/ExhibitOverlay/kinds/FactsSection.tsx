/** FactsSection — a two-column grid of figures under a hairline, as every data block sits. */

import type { ReactNode } from 'react';

import type { ExhibitFactsSection } from '../../../@types/exhibits/ExhibitFactsSection';
import styles from '../ExhibitOverlay.module.css';

export type FactsSectionProps = {
  readonly data: ExhibitFactsSection;
};

function FactsSection({ data }: FactsSectionProps): ReactNode {
  return (
    <>
      <div className={styles.rule} aria-hidden="true" />
      <div className={styles.facts}>
        {data.facts.map((fact) => (
          <div key={fact.label} className={styles.fact}>
            <div className={styles.factLabel}>{fact.label}</div>
            <div className={styles.factValue}>{fact.value}</div>
          </div>
        ))}
      </div>
    </>
  );
}

export default FactsSection;
