import { useId } from 'react';
import type { ReactNode } from 'react';
import { CONTROL_SHORTCUT } from '../../../data/controlShortcut';
import { shortcutLabel } from '../../../utils/shortcutLabel';
import chrome from '../controlChrome.module.css';
import styles from './QuitPanel.module.css';

export type QuitPanelProps = {
  readonly onQuit: () => void;
};

function QuitPanel({ onQuit }: QuitPanelProps): ReactNode {
  const titleId = useId();
  return (
    <section className={styles.root} aria-labelledby={titleId}>
      <h2 id={titleId} className={chrome.title}>
        Quit
      </h2>
      <div className={chrome.row}>
        <button type="button" className={chrome.button} onClick={onQuit}>
          Quit Skymap
        </button>
      </div>
      <p className={chrome.dim}>
        Show or hide this window:{' '}
        <kbd className={styles.key}>
          {shortcutLabel(CONTROL_SHORTCUT, navigator.userAgent.includes('Mac'))}
        </kbd>
      </p>
    </section>
  );
}

export default QuitPanel;
