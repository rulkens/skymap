/*
 * AddressStrip — an app address shown as a browser's address field, which is
 * also the link, with a copy control (CopyButton) at its end as a browser has. The one boxed
 * element on the site: it depicts a real field, raised over the view it opens. Lines break only
 * between parameters. `plain` is the address among a docs page's text (Example): no box, and
 * words to read, the link being the control under it. `query` is a flag
 * before the `#`; `shown` prints a shorter address than the one copied; `param` gives each
 * parameter's span its props by key, for a figure that pairs a parameter with what it sets.
 */
import { Fragment } from 'react';
import type { HTMLAttributes } from 'react';

import { APP_BASE, appLink } from '../../../../data/appLink.ts';
import { cx } from '../../../../utils/cx.ts';
import CopyButton from '../CopyButton/CopyButton.tsx';
import styles from './AddressStrip.module.css';

type AddressStripProps = {
  hash: string;
  query?: string;
  shown?: string;
  plain?: boolean;
  param?: (key: string) => HTMLAttributes<HTMLSpanElement>;
};

function AddressStrip({ hash, query, shown = hash, plain = false, param }: AddressStripProps) {
  const site = new URL(import.meta.env.SITE);
  const address = appLink(hash, query);
  const params = shown.split('&').map((pair) => {
    const at = pair.indexOf('=');
    // A long value (a pose) may break after a comma, never inside a number.
    return { key: pair.slice(0, at), parts: pair.slice(at + 1).split(',') };
  });
  const shownAddress = (
    <>
      {site.host}
      {APP_BASE}
      {query && `?${query}`}#
      {params.map((p, i) => (
        <span key={i} {...param?.(p.key)}>
          {i > 0 && '&'}
          {p.key}=
          <b>
            {p.parts.map((part, k) => (
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
        </span>
      ))}
    </>
  );
  return (
    <div className={cx(styles.root, !plain && styles.raised)}>
      {plain ? (
        <span className={styles.address}>{shownAddress}</span>
      ) : (
        <a className={styles.address} href={address}>
          {shownAddress}
        </a>
      )}
      <CopyButton text={site.origin + address} label="Copy the address" />
    </div>
  );
}

export default AddressStrip;
