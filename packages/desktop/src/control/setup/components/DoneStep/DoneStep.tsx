/** DoneStep — after Finish: where the sky is, or what it waits for, and the way back to this window. */

import type { ReactNode } from 'react';
import { controlShortcutText } from '../../../shell/utils/controlShortcutText';
import chrome from '../../../controlChrome.module.css';
import styles from './DoneStep.module.css';

export type DoneStepProps = {
  readonly skyRunning: boolean;
  /** 1-based, as the screens are named; null on a single screen. */
  readonly skyDisplay: number | null;
};

function DoneStep({ skyRunning, skyDisplay }: DoneStepProps): ReactNode {
  const where = skyDisplay === null ? 'on this screen' : `on display ${skyDisplay}`;
  const key = <kbd className={chrome.mono}>{controlShortcutText()}</kbd>;
  return skyRunning ? (
    <div className={styles.root}>
      <p className={chrome.text} role="status">
        The sky is running {where}.
      </p>
      <p className={chrome.text}>{key} shows or hides this window.</p>
    </div>
  ) : (
    <div className={styles.root}>
      <p className={chrome.text} role="status">
        Setup is saved. The sky starts {where} when the download finishes.
      </p>
      <p className={chrome.text}>
        You can close this window: the download carries on, and {key} brings it back.
      </p>
    </div>
  );
}

export default DoneStep;
