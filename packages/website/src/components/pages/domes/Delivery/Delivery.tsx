/*
 * Delivery — the ways a dome gets Skymap, side by side as a specification: each child is a DeliveryColumn,
 * and wide, the columns share their rows, so a picture's foot, a heading and every line of the
 * specification sit level across the page. Narrow, the columns follow one another.
 */
import type { ReactNode } from 'react';

import styles from './Delivery.module.css';

type DeliveryProps = { children: ReactNode };

function Delivery({ children }: DeliveryProps) {
  return <div className={styles.root}>{children}</div>;
}

export default Delivery;
