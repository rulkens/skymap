/*
 * AddressStrip — an app address shown as a browser's address field, which is
 * also the link, with a copy control (CopyButton) at its end as a browser has. The one boxed
 * element on the site: it depicts a real field, raised over the view it opens. Lines break only
 * between parameters. `plain` is the address among a docs page's text (Example): no box, and
 * words to read, the link being the control under it. `query` is a flag
 * before the `#`; `shown` prints a shorter address than the one copied (shownLink).
 */
import { appAddress } from '../../../../utils/appAddress.ts';
import { cx } from '../../../../utils/cx.ts';
import AddressText from '../AddressText/AddressText.tsx';
import AppLink from '../AppLink/AppLink.tsx';
import CopyButton from '../CopyButton/CopyButton.tsx';
import styles from './AddressStrip.module.css';

type AddressStripProps = {
  hash: string;
  query?: string;
  shown?: string;
  plain?: boolean;
};

function AddressStrip({ hash, query, shown = hash, plain = false }: AddressStripProps) {
  const shownAddress = <AddressText hash={shown} query={query} />;
  return (
    <div className={cx(styles.root, !plain && styles.raised)}>
      {plain ? (
        <span className={styles.address}>{shownAddress}</span>
      ) : (
        <AppLink className={styles.address} view={hash} query={query}>
          {shownAddress}
        </AppLink>
      )}
      <CopyButton text={appAddress(hash, query)} label="Copy the address" />
    </div>
  );
}

export default AddressStrip;
