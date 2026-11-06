import type { ReactNode } from 'react';
import { controlShortcutText } from '../../utils/controlShortcutText';
import chrome from '../../../controlChrome.module.css';
import styles from './QuitPanel.module.css';

export type QuitPanelProps = {
  readonly onQuit: () => void;
};

function QuitPanel({ onQuit }: QuitPanelProps): ReactNode {
  return (
    <section className={styles.root} aria-label="Quit">
      <div className={chrome.row}>
        <button type="button" className={chrome.button} onClick={onQuit}>
          Quit Skymap
        </button>
        <p className={chrome.dim}>
          Open this window again: <kbd className={chrome.mono}>{controlShortcutText()}</kbd>
        </p>
      </div>
    </section>
  );
}

export default QuitPanel;
