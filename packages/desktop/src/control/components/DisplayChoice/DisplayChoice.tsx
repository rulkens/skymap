/**
 * DisplayChoice — the connected screens as cards, the sky's one marked. Displays are numbered from 1
 * in the OS's order, as the kiosk test grid labels them; their ids mean nothing to a person.
 */

import type { ReactNode } from 'react';
import type { DisplayInfo } from '../../../@types/DisplayInfo';
import type { InstallSetup } from '../../../@types/InstallSetup';
import { placeWindows } from '../../../main/placeWindows';
import { displayDetail } from '../../../utils/displayDetail';
import { missingDisplayText } from '../../../utils/missingDisplayText';
import chrome from '../controlChrome.module.css';
import styles from './DisplayChoice.module.css';

export type DisplayChoiceProps = {
  readonly stored: InstallSetup['display'];
  readonly displays: readonly DisplayInfo[];
  readonly onPick: (display: NonNullable<InstallSetup['display']>) => void;
};

function DisplayChoice({ stored, displays, onPick }: DisplayChoiceProps): ReactNode {
  const skyId = placeWindows(stored, displays)?.sky.id;
  const missing = missingDisplayText(stored, displays);
  return (
    <fieldset className={styles.root}>
      <legend className={chrome.unseen}>Sky screen</legend>
      {missing && (
        <p className={styles.missing} role="status">
          {missing}
        </p>
      )}
      {displays.map((display, index) => (
        <label key={display.id} className={chrome.card}>
          <input
            type="radio"
            name="display"
            className={chrome.unseen}
            checked={display.id === skyId}
            onChange={() =>
              onPick({ id: display.id, width: display.width, height: display.height })
            }
          />
          <span className={chrome.cardHead}>
            <span className={display.id === skyId ? chrome.markerOn : chrome.marker} />
            Display {index + 1}
          </span>
          <span className={styles.detail}>{displayDetail(display)}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default DisplayChoice;
