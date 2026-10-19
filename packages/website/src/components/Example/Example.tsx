/*
 * Example — `<Example to="focus=body-saturn" address>Saturn.</Example>` on a
 * docs page: a link a reader can open, as one block. What it opens (the
 * children), then with `address` the address itself as AddressStrip prints
 * it, unboxed and with its copy control, then the link. `shown` prints a
 * shorter address than the link carries, for one too long to read. One under
 * another they make a list, a rule between each.
 */
import type { ReactNode } from 'react';

import AddressStrip from '../AddressStrip/AddressStrip.tsx';
import View from '../View/View.tsx';
import styles from './Example.module.css';

type ExampleProps = {
  to: string;
  query?: string;
  label?: string;
  address?: boolean;
  shown?: string;
  children?: ReactNode;
};

function Example({
  to,
  query,
  label = 'Open this view',
  address = false,
  shown,
  children,
}: ExampleProps) {
  return (
    <div className={styles.root} data-embed>
      {children != null && <p className={styles.what}>{children}</p>}
      {address && <AddressStrip plain hash={to} query={query} shown={shown} />}
      <View to={to} query={query}>
        {label}
      </View>
    </div>
  );
}

export default Example;
