/** SetupSection — the set-once choices: which camera controls the dome uses, and pairing another phone. */

import type { ReactNode } from 'react';
import type { ControlSchemeId } from '../../../@types/engine/camera/ControlSchemeId';
import SchemeSwitch from '../SchemeSwitch/SchemeSwitch';
import controls from '../remoteControls.module.css';

export type SetupSectionProps = {
  /** Absent until the dome's first status. */
  readonly scheme: ControlSchemeId | undefined;
  readonly onSchemeChange: (scheme: ControlSchemeId) => void;
  readonly onAddPhone: () => void;
};

function SetupSection({ scheme, onSchemeChange, onAddPhone }: SetupSectionProps): ReactNode {
  return (
    <section className={controls.section}>
      <h2 className={controls.heading}>Setup</h2>
      {scheme && <SchemeSwitch scheme={scheme} onChange={onSchemeChange} />}
      <button type="button" className={controls.button} onClick={onAddPhone}>
        Add a phone
      </button>
    </section>
  );
}

export default SetupSection;
