import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import cx from 'classnames';
import { useObjectIndex } from '../../../session/hooks/useObjectIndex';
import { objectMatches } from '../../../kinds/utils/object/objectMatches';
import { wrapIndex } from '../../../../../../src/components/CommandPalette/utils/wrapIndex';
import type { ObjectMatch } from '../../../@types/kinds/ObjectMatch';
import s from './ObjectPicker.module.css';

type Props = {
  readonly label: string;
  /** What the field reads while not typing: the object's name, or the position it stored. */
  readonly value: string;
  readonly onPick: (focusId: string) => void;
  /** Given, emptying the field offers None, which calls it. */
  readonly onClear?: () => void;
};

/**
 * Picks an object by name with the app's own search: type to filter, ↑/↓, Enter picks, Escape puts
 * the value back (a second Escape leaves the field). The list opens in place, like LayerPickField.
 */
function ObjectPicker({ label, value, onPick, onClear }: Props) {
  const index = useObjectIndex();
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const typed = query?.trim() ?? '';
  const matches = useMemo(() => (typed === '' ? [] : objectMatches(index, typed)), [index, typed]);
  // Null is None: offered only while the field is emptied, never beside search results.
  const options: readonly (ObjectMatch | null)[] =
    onClear !== undefined && query !== null && typed === '' ? [null] : matches;

  const close = () => {
    setQuery(null);
    setActive(0);
  };
  const pick = (match: ObjectMatch | null) => {
    if (match === null) onClear?.();
    else onPick(match.focusId);
    close();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => wrapIndex(i, e.key === 'ArrowDown' ? 1 : -1, options.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const match = options[active];
      if (match !== undefined) pick(match);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query === null) e.currentTarget.blur();
      else close();
    }
  };

  return (
    <span className={s.root}>
      <input
        className={s.input}
        role="combobox"
        aria-label={label}
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={options[active] !== undefined ? `${listId}-${active}` : undefined}
        placeholder="Search objects"
        spellCheck={false}
        value={query ?? value}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={close}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {options.length > 0 && (
        <ul id={listId} role="listbox" aria-label={label} className={s.list}>
          {options.map((match, i) => (
            <li
              key={match?.focusId ?? 'none'}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cx(s.option, i === active && s.active)}
              // Keeps focus in the input, so its blur does not close the list before the click.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(match)}
            >
              <span className={s.name}>{match?.name ?? 'None'}</span>
              {match !== null && <span className={s.kind}>{match.kind}</span>}
            </li>
          ))}
        </ul>
      )}
      {typed !== '' && matches.length === 0 && (
        <span role="status" className={s.empty}>
          No object named “{typed}”
        </span>
      )}
    </span>
  );
}

export default ObjectPicker;
