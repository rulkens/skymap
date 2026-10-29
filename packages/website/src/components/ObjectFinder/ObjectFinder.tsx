/*
 * ObjectFinder — the head of the object catalogue: a field that narrows every
 * ObjectList on the page as you type, and the sections with their counts as a
 * jump list (a phone has no "On this page"). Typing hides every row whose
 * names and id do not hold what was typed, then every list and section left
 * with no row, heading included: a section's heading is the `h2` before its
 * ObjectList. The field is shown once this has run, so without script the page
 * is the jump list and the plain lists. The lists are another component's
 * markup, reached through its `data-object*` hooks.
 */
import { useEffect, useRef, useState } from 'react';

import type { ObjectSectionCount } from '../../@types/ObjectSectionCount';
import { foldText } from '../../utils/foldText.ts';
import styles from './ObjectFinder.module.css';

type ObjectFinderProps = { sections: readonly ObjectSectionCount[] };

type Rows = { row: HTMLElement; text: string }[];

function ObjectFinder({ sections }: ObjectFinderProps) {
  const input = useRef<HTMLInputElement>(null);
  const rows = useRef<Rows>([]);
  const [ready, setReady] = useState(false);
  const [typed, setTyped] = useState('');
  const [shown, setShown] = useState(0);
  const query = typed.trim();

  useEffect(() => {
    rows.current = [...document.querySelectorAll<HTMLElement>('[data-object]')].map((row) => ({
      row,
      // The link's own word is not a name: only the names and the id are searched.
      text: foldText(
        [...row.querySelectorAll('[data-object-name], code')]
          .map((part) => part.textContent ?? '')
          .join(' '),
      ),
    }));
    setReady(true);
    // A field the browser filled in again after Back.
    setTyped(input.current!.value);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const folded = foldText(query);
    let count = 0;
    for (const { row, text } of rows.current) {
      row.hidden = folded !== '' && !text.includes(folded);
      if (!row.hidden) count++;
    }
    for (const sub of document.querySelectorAll<HTMLElement>('[data-object-sub]'))
      sub.hidden = !sub.querySelector('[data-object]:not([hidden])');
    for (const block of document.querySelectorAll<HTMLElement>('[data-objects]')) {
      // A section is its list and everything back to its heading.
      const parts: HTMLElement[] = [block];
      let before = block.previousElementSibling as HTMLElement | null;
      while (before && before.tagName !== 'H2') {
        parts.push(before);
        before = before.previousElementSibling as HTMLElement | null;
      }
      if (before) parts.push(before);
      const empty = !block.querySelector('[data-object]:not([hidden])');
      for (const part of parts) part.hidden = empty;
      // The count is of the whole section, and a jump to a hidden heading goes nowhere.
      const total = block.querySelector<HTMLElement>('[data-object-count]');
      if (total) total.hidden = folded !== '';
      if (before)
        for (const jump of document.querySelectorAll(`[data-sections] a[href="#${before.id}"]`))
          jump.toggleAttribute('aria-disabled', empty);
    }
    setShown(count);
  }, [ready, query]);

  return (
    <div className={styles.root} data-embed data-pagefind-ignore>
      <p className={styles.field} hidden={!ready}>
        <label className={styles.label} htmlFor="object-filter">
          Narrow the list
        </label>
        <input
          ref={input}
          id="object-filter"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="A name, another name or an id"
          onChange={(event) => setTyped(event.target.value)}
        />
        <span className={styles.status} role="status">
          {query === ''
            ? ''
            : shown === 0
              ? `No name or id here holds “${query}”.`
              : `${shown} of ${rows.current.length} rows`}
        </span>
      </p>
      <ul className={styles.kinds} hidden={query !== ''}>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.title}</a> <span>{section.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ObjectFinder;
