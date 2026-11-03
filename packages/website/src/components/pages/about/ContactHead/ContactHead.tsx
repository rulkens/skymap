/*
 * ContactHead — a section's heading (the children) with the address to write to set under it at the heading's
 * size, so the two read as one headline: the section's action is its title. The address is a mail link printed
 * as text, to be read and typed where no mail program opens, with a copy control beside it. Without an address
 * the heading stands alone.
 */
import type { ReactNode } from 'react';

import CopyButton from '../../../shared/links/CopyButton/CopyButton.tsx';
import styles from './ContactHead.module.css';

type ContactHeadProps = { email?: string; children: ReactNode };

function ContactHead({ email, children }: ContactHeadProps) {
  return (
    <div className={styles.root}>
      <div className={styles.title}>{children}</div>
      {email && (
        <p className={styles.address}>
          <a href={`mailto:${email}`}>{email}</a>
          <CopyButton text={email} label="Copy the address" />
        </p>
      )}
    </div>
  );
}

export default ContactHead;
