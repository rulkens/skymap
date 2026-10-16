/** JoinField — the one field shown when the page was opened without a room code in its address. */

import { useState } from 'react';
import type { FormEvent } from 'react';
import controls from '../remoteControls.module.css';
import styles from './JoinField.module.css';

// Crockford base32: I and L read as 1, O as 0; U is not in the alphabet.
const normalise = (typed: string): string =>
  typed
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, '');

export type JoinFieldProps = { onJoin: (code: string) => void };

function JoinField({ onJoin }: JoinFieldProps) {
  const [code, setCode] = useState('');
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (code) onJoin(code);
  };
  return (
    <form className={styles.root} onSubmit={submit}>
      <label className={styles.label} htmlFor="room-code">
        Room code, shown on the dome
      </label>
      <input
        id="room-code"
        className={styles.input}
        value={code}
        onChange={(e) => setCode(normalise(e.target.value))}
        maxLength={8}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
      />
      <button type="submit" className={controls.button} disabled={code.length !== 8}>
        Join
      </button>
    </form>
  );
}

export default JoinField;
