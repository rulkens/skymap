/*
 * Remark — one true sentence set apart from the page's argument, at most one
 * a page and never in its opening section. `text` is the sentence as it stands
 * without script; `live` names a figure worked out in the reader's browser,
 * which replaces it when the line scrolls into view.
 */
import { useEffect, useRef } from 'react';

import { cx } from '../../utils/cx.ts';
import { domeTurnLine } from '../../utils/domeTurnLine.ts';
import { filesFetchedLine } from '../../utils/filesFetchedLine.ts';
import { liveLine } from '../../utils/liveLine.ts';
import styles from './Remark.module.css';

type RemarkProps = { text: string; live?: 'dome-turn' | 'files-fetched' };

const SAY: Record<NonNullable<RemarkProps['live']>, () => string> = {
  'dome-turn': () => domeTurnLine(performance.now() / 1000),
  // The page itself and everything it asked for, as the browser's own timing list has them.
  'files-fetched': () =>
    filesFetchedLine(
      [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
        .map((entry) => entry.name)
        .filter((name) => name.startsWith('http')),
    ),
};

function Remark({ text, live }: RemarkProps) {
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => (live ? liveLine(line.current!, SAY[live]) : undefined), [live]);
  return (
    <p ref={line} className={cx(styles.root, live && styles.live)}>
      {text}
    </p>
  );
}

export default Remark;
