/**
 * SetupPanel — mode, sky display, autostart and the data-update schedule; every change saves at
 * once. The test grid is not part of the setup: it is a view toggle the sky drops on a mode change.
 */

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { DataUpdates } from '../../../@types/DataUpdates';
import type { DisplayInfo } from '../../../@types/DisplayInfo';
import type { InstallSetup } from '../../../@types/InstallSetup';
import type { SetupSaveState } from '../../../@types/SetupSaveState';
import { DEFAULT_DAILY_UPDATE_TIME } from '../../../data/defaultDailyUpdateTime';
import { chosenDisplay } from '../../../utils/chosenDisplay';
import { dataUpdatesFrom } from '../../../utils/dataUpdatesFrom';
import { displayOptionLabel } from '../../../utils/displayOptionLabel';
import { SAVE_STATE_TEXT } from './SetupPanel.constants';
import chrome from '../controlChrome.module.css';
import styles from './SetupPanel.module.css';

export type SetupPanelProps = {
  readonly setup: InstallSetup;
  readonly displays: readonly DisplayInfo[];
  readonly saveState: SetupSaveState;
  readonly onSave: (next: InstallSetup) => void;
  readonly onShowTestGrid: (on: boolean) => void;
};

function SetupPanel({
  setup,
  displays,
  saveState,
  onSave,
  onShowTestGrid,
}: SetupPanelProps): ReactNode {
  const titleId = useId();
  const [testGrid, setTestGrid] = useState(false);
  const updates = setup.dataUpdates;
  const dailyAt = updates.kind === 'daily' ? updates.at : DEFAULT_DAILY_UPDATE_TIME;

  const showTestGrid = (on: boolean): void => {
    setTestGrid(on);
    onShowTestGrid(on);
  };
  const pickMode = (mode: InstallSetup['mode']): void => {
    showTestGrid(false);
    onSave({ ...setup, mode });
  };
  const pickUpdates = (kind: DataUpdates['kind'], at = dailyAt): void =>
    onSave({ ...setup, dataUpdates: dataUpdatesFrom(kind, at) });

  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <h2 id={titleId} className={chrome.title}>
        Setup
      </h2>
      <fieldset className={chrome.fieldset}>
        <legend className={chrome.legend}>Mode</legend>
        <label className={chrome.choice}>
          <input
            type="radio"
            name="mode"
            className={chrome.check}
            checked={setup.mode === 'kiosk'}
            onChange={() => pickMode('kiosk')}
          />
          Kiosk
        </label>
        <label className={chrome.choice}>
          <input
            type="radio"
            name="mode"
            className={chrome.check}
            checked={setup.mode === 'dome'}
            onChange={() => pickMode('dome')}
          />
          Dome
        </label>
      </fieldset>
      <label className={chrome.field}>
        Sky display
        <select
          className={chrome.control}
          value={setup.display === null ? '' : String(setup.display.id)}
          onChange={(e) => onSave({ ...setup, display: chosenDisplay(displays, e.target.value) })}
        >
          <option value="">Primary display</option>
          {displays.map((display, index) => (
            <option key={display.id} value={String(display.id)}>
              {displayOptionLabel(display, index)}
            </option>
          ))}
        </select>
      </label>
      <label className={chrome.choice}>
        <input
          type="checkbox"
          className={chrome.check}
          checked={testGrid}
          onChange={(e) => showTestGrid(e.target.checked)}
        />
        Show test grid on the sky
      </label>
      <label className={chrome.choice}>
        <input
          type="checkbox"
          className={chrome.check}
          checked={setup.autostart}
          onChange={(e) => onSave({ ...setup, autostart: e.target.checked })}
        />
        Start Skymap when the computer starts
      </label>
      <fieldset className={chrome.fieldset}>
        <legend className={chrome.legend}>Data updates</legend>
        <label className={chrome.choice}>
          <input
            type="radio"
            name="updates"
            className={chrome.check}
            checked={updates.kind === 'atLaunch'}
            onChange={() => pickUpdates('atLaunch')}
          />
          At every launch
        </label>
        <label className={chrome.choice}>
          <input
            type="radio"
            name="updates"
            className={chrome.check}
            checked={updates.kind === 'daily'}
            onChange={() => pickUpdates('daily')}
          />
          Every day at
        </label>
        <input
          type="time"
          className={chrome.control}
          aria-label="Daily update time"
          value={dailyAt}
          disabled={updates.kind !== 'daily'}
          onChange={(e) => pickUpdates('daily', e.target.value)}
        />
        <label className={chrome.choice}>
          <input
            type="radio"
            name="updates"
            className={chrome.check}
            checked={updates.kind === 'manual'}
            onChange={() => pickUpdates('manual')}
          />
          Only with Update now
        </label>
      </fieldset>
      <p className={chrome.dim} role="status">
        {SAVE_STATE_TEXT[saveState]}
      </p>
    </section>
  );
}

export default SetupPanel;
