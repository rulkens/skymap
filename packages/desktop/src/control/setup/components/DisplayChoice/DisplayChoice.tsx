/** DisplayChoice — the connected screens as cards by number, as the kiosk test grid labels them; the sky's one marked. */

import type { ReactNode } from 'react';
import type { DisplayInfo } from '../../../../@types/DisplayInfo';
import type { InstallSetup } from '../../../../@types/InstallSetup';
import type { WindowPlacement } from '../../../../@types/WindowPlacement';
import { displayDetail } from '../../utils/displayDetail';
import { missingDisplayText } from '../../utils/missingDisplayText';
import chrome from '../../../controlChrome.module.css';
import styles from './DisplayChoice.module.css';

export type DisplayChoiceProps = {
  readonly stored: InstallSetup['display'];
  readonly displays: readonly DisplayInfo[];
  readonly placement: WindowPlacement | null;
  readonly onPick: (display: NonNullable<InstallSetup['display']>) => void;
};

function DisplayChoice({ stored, displays, placement, onPick }: DisplayChoiceProps): ReactNode {
  const skyId = placement?.sky.id;
  const missing = missingDisplayText(stored, placement);
  return (
    <fieldset className={styles.root}>
      <legend className={chrome.unseen}>Sky screen</legend>
      {missing && (
        <p className={styles.missing} role="status">
          {missing}
        </p>
      )}
      {displays.map((display) => (
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
            Display {display.number}
          </span>
          <span className={styles.detail}>{displayDetail(display)}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default DisplayChoice;
