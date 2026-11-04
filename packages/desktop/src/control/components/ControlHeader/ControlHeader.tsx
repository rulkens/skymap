/**
 * ControlHeader — the website's wordmark and the quiet way into Help and About. Each link opens its
 * view and closes it again, like the site's nav. The bar is the window's drag region once the shell
 * hides the title bar, so its controls opt out of dragging.
 */

import type { ReactNode } from 'react';
import Wordmark from '../../../../../website/src/components/shared/text/Wordmark/Wordmark';
import type { ControlView } from '../../../@types/ControlView';
import chrome from '../controlChrome.module.css';
import styles from './ControlHeader.module.css';

export type ControlHeaderProps = {
  readonly view: ControlView | null;
  readonly showMark: boolean;
  readonly onToggle: (view: 'help' | 'about') => void;
};

function ControlHeader({ view, showMark, onToggle }: ControlHeaderProps): ReactNode {
  return (
    <header className={styles.root}>
      <span className={showMark ? styles.mark : styles.markHidden} aria-hidden={!showMark}>
        <Wordmark />
      </span>
      <nav className={styles.nav} aria-label="Skymap">
        {(['help', 'about'] as const).map((target) => (
          <button
            key={target}
            type="button"
            className={chrome.link}
            aria-current={view === target ? 'page' : undefined}
            onClick={() => onToggle(target)}
          >
            {target === 'help' ? 'Help' : 'About'}
          </button>
        ))}
      </nav>
    </header>
  );
}

export default ControlHeader;
