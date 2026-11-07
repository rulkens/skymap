/** SaveStatus — whether the last setup change is stored, beside the choices it describes; a failure is an alert. */

import type { ReactNode } from 'react';
import type { SetupSaveState } from '../../@types/SetupSaveState';
import { SAVE_STATE_TEXT } from './SaveStatus.constants';
import chrome from '../../../controlChrome.module.css';

export type SaveStatusProps = {
  readonly state: SetupSaveState;
};

function SaveStatus({ state }: SaveStatusProps): ReactNode {
  const failed = state === 'failed';
  return (
    <p className={failed ? chrome.text : chrome.dim} role={failed ? 'alert' : 'status'}>
      {SAVE_STATE_TEXT[state]}
    </p>
  );
}

export default SaveStatus;
