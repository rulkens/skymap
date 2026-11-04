/** UpdatesChoice — starting with the computer and when the data updates; each change saves at once. */

import type { ReactNode } from 'react';
import type { DataUpdates } from '../../../../@types/DataUpdates';
import type { InstallSetup } from '../../../../@types/InstallSetup';
import { DEFAULT_DAILY_UPDATE_TIME } from '../../data/defaultDailyUpdateTime';
import { dataUpdatesFrom } from '../../utils/dataUpdatesFrom';
import chrome from '../../../controlChrome.module.css';
import styles from './UpdatesChoice.module.css';

export type UpdatesChoiceProps = {
  readonly setup: InstallSetup;
  readonly onSave: (next: InstallSetup) => void;
};

function UpdatesChoice({ setup, onSave }: UpdatesChoiceProps): ReactNode {
  const updates = setup.dataUpdates;
  const dailyAt = updates.kind === 'daily' ? updates.at : DEFAULT_DAILY_UPDATE_TIME;
  const pick = (kind: DataUpdates['kind'], at = dailyAt): void =>
    onSave({ ...setup, dataUpdates: dataUpdatesFrom(kind, at) });
  const radio = (kind: DataUpdates['kind'], label: string): ReactNode => (
    <label className={chrome.choice}>
      <input
        type="radio"
        name="updates"
        className={chrome.check}
        checked={updates.kind === kind}
        onChange={() => pick(kind)}
      />
      {label}
    </label>
  );
  return (
    <div className={styles.root}>
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
        {radio('atLaunch', 'At every launch')}
        <div className={chrome.row}>
          {radio('daily', 'Every day at')}
          <input
            type="time"
            className={chrome.control}
            aria-label="Daily update time"
            value={dailyAt}
            disabled={updates.kind !== 'daily'}
            onChange={(e) => pick('daily', e.target.value)}
          />
        </div>
        {radio('manual', 'Only with Update now')}
      </fieldset>
    </div>
  );
}

export default UpdatesChoice;
