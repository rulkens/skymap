/*
 * InlineAddress — an address inside a sentence: it may break anywhere, or it
 * pushes a phone's page sideways.
 */
import type { ReactNode } from 'react';

import styles from './InlineAddress.module.css';

type InlineAddressProps = { children: ReactNode };

function InlineAddress({ children }: InlineAddressProps) {
  return <span className={styles.root}>{children}</span>;
}

export default InlineAddress;
