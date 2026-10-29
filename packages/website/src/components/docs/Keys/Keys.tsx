/* Keys — a key or a chord on a docs page: `<Keys of="Shift+/" />`. Each key is drawn as one (the `kbd` rule in styles/site.css) and the chord never breaks across lines. */
import { Fragment } from 'react';

import styles from './Keys.module.css';

type KeysProps = { of: string };

function Keys({ of }: KeysProps) {
  const keys = of.split('+').map((key) => key.trim());
  return (
    <span className={styles.root}>
      {keys.map((key, i) => (
        <Fragment key={i}>
          {i > 0 && ' + '}
          <kbd>{key}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

export default Keys;
