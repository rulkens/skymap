/*
 * KeysHelp — the key reference: a box that hangs from the review bar it is a child of. Keys are
 * <kbd>; mouse actions are plain words. It opens on a click of the bar's Keys button or on `?`.
 */
import { Fragment, useEffect, useRef } from 'react';

import styles from './KeysHelp.module.css';
import { GROUPS } from './KeysHelp.constants.ts';

type KeysHelpProps = {
  /** Put the cursor in the box as it opens, so the keyboard reaches it. */
  focus: boolean;
};

function KeysHelp({ focus }: KeysHelpProps) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) root.current?.focus();
  }, [focus]);

  return (
    <div
      ref={root}
      className={styles.root}
      id="review-help"
      tabIndex={-1}
      role="group"
      aria-label="Keys"
      data-review-keys=""
    >
      {GROUPS.map(([title, rows]) => (
        <Fragment key={title}>
          <h3>{title}</h3>
          <dl>
            {rows.map((row) => (
              <Fragment key={row.does}>
                <dt>{'key' in row ? <kbd className={styles.key}>{row.key}</kbd> : row.word}</dt>
                <dd>{row.does}</dd>
              </Fragment>
            ))}
          </dl>
        </Fragment>
      ))}
    </div>
  );
}

export default KeysHelp;
