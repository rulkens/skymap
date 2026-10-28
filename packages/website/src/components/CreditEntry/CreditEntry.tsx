/*
 * CreditEntry — one source on the credits page: its name with how it may be
 * used beside it (the `Use` terms, a column to run an eye down), who made it,
 * and the credit its holder asks for, the holder's own words set apart with a
 * control that copies them. Its terms in full are on its data page. Every
 * word but the labels is the licence record's.
 */
import type { DataEntry } from '../../@types/DataEntry';
import DocLink from '../DocLink/DocLink.tsx';
import RecordText from '../RecordText/RecordText.tsx';
import Row from '../Row/Row.tsx';
import UseTerms from '../UseTerms/UseTerms.tsx';
import styles from './CreditEntry.module.css';

type CreditEntryProps = { entry: DataEntry };

function CreditEntry({ entry }: CreditEntryProps) {
  const { bullets, use } = entry.record;
  return (
    <section className={styles.root} data-embed>
      <header>
        <h3 id={entry.id}>
          <RecordText text={entry.record.heading} phrase />
        </h3>
        <p>
          <UseTerms use={use} />
        </p>
      </header>
      <dl>
        <Row label="Made by">
          <RecordText text={bullets.By ?? ''} />
        </Row>
        <Row label="Credit to give">
          <RecordText text={bullets.Attribution ?? ''} lift copy />
        </Row>
        <Row label="Terms in full">
          <p className={styles.terms}>
            <DocLink href={entry.href}>{entry.title}</DocLink>
          </p>
        </Row>
      </dl>
    </section>
  );
}

export default CreditEntry;
