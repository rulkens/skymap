/** SearchSection — type a name, get the dome's matches, tap one to fly there. */

import { useEffect, useState } from 'react';
import cx from 'classnames';
import { MAX_SEARCH_QUERY_CHARS } from '../../../data/remote/maxSearchQueryChars';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import type { RemoteSearchMatch } from '../../../@types/remote/RemoteSearchMatch';
import controls from '../remoteControls.module.css';
import styles from './SearchSection.module.css';

const DEBOUNCE_MS = 200;

export type SearchSectionProps = {
  matches: readonly RemoteSearchMatch[];
  onSearch: (query: string) => void;
  onCommand: (command: RemoteCommand) => void;
};

function SearchSection({ matches, onSearch, onCommand }: SearchSectionProps) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    // Empty clears at once, which also drops the last search's results when the sheet reopens.
    if (query === '') {
      onSearch('');
      return;
    }
    const timer = setTimeout(() => onSearch(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  return (
    <div className={controls.stack}>
      <input
        className={controls.input}
        type="search"
        aria-label="Search"
        placeholder="Andromeda, Saturn"
        value={query}
        maxLength={MAX_SEARCH_QUERY_CHARS}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Escape clears a filled field; the sheet's Escape handler only sees it once empty.
          if (e.key !== 'Escape' || e.nativeEvent.isComposing || query === '') return;
          e.stopPropagation();
          setQuery('');
        }}
      />
      {query.trim() !== '' && matches.length === 0 && (
        <p className={controls.quiet}>No match for “{query.trim()}”</p>
      )}
      <ul className={controls.rows}>
        {matches.map((match, i) => (
          <li key={`${i}-${match.name}`}>
            <button
              type="button"
              className={cx(controls.button, controls.row)}
              onClick={() => onCommand({ name: 'goTo', payload: match.action })}
            >
              <span className={controls.grow}>{match.name}</span>
              <span className={styles.kind}>{match.kind}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SearchSection;
