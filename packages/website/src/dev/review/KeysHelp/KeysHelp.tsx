/*
 * KeysHelp — the key reference: a box that hangs from the review bar it is a child of. Keys are
 * <kbd>; mouse actions are plain words. It opens on a click of the bar's Keys button or on `?`.
 */
import { useEffect, useRef } from 'react';

import styles from './KeysHelp.module.css';

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
      <h3>Overlay</h3>
      <dl>
        <dt>
          <kbd>F</kbd>
        </dt>
        <dd>Turns the overlay on and off</dd>
        <dt>
          <kbd>Esc</kbd>
        </dt>
        <dd>Cancels</dd>
      </dl>
      <h3>Notes</h3>
      <dl>
        <dt>Click or drag</dt>
        <dd>Leaves a note on the page</dd>
      </dl>
      <h3>Marks</h3>
      <dl>
        <dt>
          <kbd>Shift</kbd> + drag
        </dt>
        <dd>Selects text</dd>
        <dt>
          <kbd>C</kbd>
        </dt>
        <dd>Cuts the selected text</dd>
        <dt>
          <kbd>W</kbd>
        </dt>
        <dd>Rewrites the selected text</dd>
        <dt>
          <kbd>G</kbd>
        </dt>
        <dd>Marks the selected text good</dd>
        <dt>
          <kbd>M</kbd>
        </dt>
        <dd>Shows the marks in the text</dd>
        <dt>Click a mark</dt>
        <dd>Cycles cut, keep, rewrite, good</dd>
        <dt>
          <kbd>H</kbd>
        </dt>
        <dd>Shows the result</dd>
        <dt>Section icon</dt>
        <dd>Opens that section&apos;s review</dd>
      </dl>
      <h3>Help</h3>
      <dl>
        <dt>
          <kbd>?</kbd>
        </dt>
        <dd>Opens and closes this box</dd>
      </dl>
    </div>
  );
}

export default KeysHelp;
