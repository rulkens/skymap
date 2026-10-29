/** SetupSection — the set-once choices: pairing another phone. */

import type { ReactNode } from 'react';
import controls from '../remoteControls.module.css';

export type SetupSectionProps = {
  readonly onAddPhone: () => void;
};

function SetupSection({ onAddPhone }: SetupSectionProps): ReactNode {
  return (
    <section className={controls.section}>
      <h2 className={controls.heading}>Setup</h2>
      <button type="button" className={controls.button} onClick={onAddPhone}>
        Add a phone
      </button>
    </section>
  );
}

export default SetupSection;
