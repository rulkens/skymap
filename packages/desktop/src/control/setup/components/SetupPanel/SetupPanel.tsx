/**
 * SetupPanel — the setup steps' choices in one place, each saving at once, and the way back into the
 * steps. The test grid is not part of the setup: it is a view toggle main drops on a mode change.
 */

import { useId } from 'react';
import type { ReactNode } from 'react';
import type { DisplayInfo } from '../../../../@types/DisplayInfo';
import type { InstallSetup } from '../../../../@types/InstallSetup';
import type { WindowPlacement } from '../../../../@types/WindowPlacement';
import type { SetupSaveState } from '../../@types/SetupSaveState';
import DisplayChoice from '../DisplayChoice/DisplayChoice';
import ModeChoice from '../ModeChoice/ModeChoice';
import UpdatesChoice from '../UpdatesChoice/UpdatesChoice';
import { SAVE_STATE_TEXT } from './SetupPanel.constants';
import chrome from '../../../controlChrome.module.css';
import styles from './SetupPanel.module.css';

export type SetupPanelProps = {
  readonly setup: InstallSetup;
  readonly displays: readonly DisplayInfo[];
  readonly placement: WindowPlacement | null;
  readonly saveState: SetupSaveState;
  readonly testGrid: boolean;
  readonly onSave: (next: InstallSetup) => void;
  readonly onShowTestGrid: (on: boolean) => void;
  readonly onRunSetup: () => void;
};

function SetupPanel({
  setup,
  displays,
  placement,
  saveState,
  testGrid,
  onSave,
  onShowTestGrid,
  onRunSetup,
}: SetupPanelProps): ReactNode {
  const titleId = useId();

  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={chrome.heading}>
          Setup
        </h2>
        <p className={chrome.dim} role="status">
          {SAVE_STATE_TEXT[saveState]}
        </p>
      </div>
      <ModeChoice mode={setup.mode} onPick={(mode) => onSave({ ...setup, mode })} compact />
      <div className={chrome.stack}>
        <h3 className={chrome.legend}>Sky screen</h3>
        <DisplayChoice
          stored={setup.display}
          displays={displays}
          placement={placement}
          onPick={(display) => onSave({ ...setup, display })}
        />
        <label className={chrome.choice}>
          <input
            type="checkbox"
            className={chrome.check}
            checked={testGrid}
            onChange={(e) => onShowTestGrid(e.target.checked)}
          />
          Show test grid on the sky
        </label>
      </div>
      <UpdatesChoice setup={setup} onSave={onSave} />
      <div>
        <button type="button" className={chrome.button} onClick={onRunSetup}>
          Run setup again
        </button>
      </div>
    </section>
  );
}

export default SetupPanel;
