/*
 * AddressText — an app address as an address field prints it: the host and base (`head` styles them), then a
 * span per parameter that `param` gives its props by key, the value set off from the key by colour alone. A
 * long value may break after a comma, never inside a number. `hash` is the parameters shown, which may be fewer
 * than the link's; a pair still being typed (no `=` yet) prints as it stands.
 */
import { Fragment } from 'react';
import type { HTMLAttributes } from 'react';

import { appAddress } from '../../../../utils/appAddress.ts';
import styles from './AddressText.module.css';

type AddressTextProps = {
  hash: string;
  query?: string;
  head?: string;
  param?: (key: string) => HTMLAttributes<HTMLSpanElement>;
};

function AddressText({ hash, query, head, param }: AddressTextProps) {
  const app = new URL(appAddress(undefined, query));
  return (
    <>
      <span className={head}>{`${app.host}${app.pathname}${app.search}#`}</span>
      {hash.split('&').map((pair, i) => {
        const at = pair.indexOf('=');
        const key = at < 0 ? pair : pair.slice(0, at);
        return (
          <span key={i} {...param?.(key)}>
            {i > 0 && '&'}
            {at < 0 ? (
              pair
            ) : (
              <>
                {key}=
                <b className={styles.value}>
                  {pair
                    .slice(at + 1)
                    .split(',')
                    .map((part, k) => (
                      <Fragment key={k}>
                        {k > 0 && (
                          <>
                            ,<wbr />
                          </>
                        )}
                        {part}
                      </Fragment>
                    ))}
                </b>
              </>
            )}
          </span>
        );
      })}
    </>
  );
}

export default AddressText;
