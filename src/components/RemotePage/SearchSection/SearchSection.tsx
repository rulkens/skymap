/** SearchSection — type a name, get the dome's matches, tap one to fly there. */

import { useEffect, useState } from 'react';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import type { RemoteSearchMatch } from '../../../@types/remote/RemoteSearchMatch';
import controls from '../remoteControls.module.css';
import styles from './SearchSection.module.css';

const DEBOUNCE_MS = 200;
const MAX_QUERY = 64;

export type SearchSectionProps = {
  matches: readonly RemoteSearchMatch[];
  onSearch: (query: string) => void;
  onCommand: (command: RemoteCommand) => void;
};

function SearchSection({ matches, onSearch, onCommand }: SearchSectionProps) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => onSearch(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  return (
    <section className={controls.section}>
      <h2 className={controls.heading}>Search</h2>
      <input
        className={styles.input}
        type="search"
        aria-label="Search the sky"
        placeholder="Galaxy, planet, cluster"
        value={query}
        maxLength={MAX_QUERY}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() !== '' && matches.length === 0 && <p className={styles.empty}>No matches.</p>}
      <ul className={styles.list}>
        {matches.map((match, i) => (
          <li key={`${i}-${match.name}`}>
            <button
              type="button"
              className={controls.button}
              onClick={() => onCommand({ name: 'goTo', payload: match.action })}
            >
              {match.name} <span className={styles.kind}>{match.kind}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default SearchSection;
