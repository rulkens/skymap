/*
 * RecordText — words of the repository's licence record (ATTRIBUTIONS.md) on
 * a docs page, printed as the record has them. `lift` sets a holder's own
 * words apart as block quotes (utils/liftQuotes.ts has the rules) and `copy`
 * gives each of those a control that copies it; `phrase` prints one run with
 * no paragraph, for a heading or a sentence. A pointer to another entry is a
 * link to that entry's page.
 */
import { dataEntry } from '../../data/dataPages.ts';
import { REPO_BLOB } from '../../data/siteIdentity.ts';
import { liftQuotes } from '../../utils/liftQuotes.ts';
import { linkEntryPointers } from '../../utils/linkEntryPointers.ts';
import { plainText } from '../../utils/plainText.ts';
import { recordHtml } from '../../utils/recordHtml.ts';
import { recordParagraphs } from '../../utils/recordParagraphs.ts';
import { sitePath } from '../../utils/sitePath.ts';
import CopyButton from '../CopyButton/CopyButton.tsx';
import styles from './RecordText.module.css';

type RecordTextProps = { text: string; lift?: boolean; copy?: boolean; phrase?: boolean };

function RecordText({ text, lift = false, copy = false, phrase = false }: RecordTextProps) {
  const linked = linkEntryPointers(text, (id) => ({
    href: sitePath(dataEntry(id).href),
    title: dataEntry(id).title,
  }));
  if (phrase) return <span dangerouslySetInnerHTML={{ __html: recordHtml(linked, REPO_BLOB) }} />;

  // The record starts some bullets in lower case, as the rest of a sentence its label began.
  const whole = recordParagraphs(linked).replace(/^[a-z]/, (first) => first.toUpperCase());
  const blocks = (lift ? liftQuotes(whole) : whole)
    .split(/\n{2,}/)
    .filter((block) => block.trim())
    .map((block) => ({ quote: block.startsWith('>'), text: block.replace(/^>\s?/gm, '') }));

  return (
    <div className={styles.root} data-embed>
      {blocks.map((block, i) =>
        block.quote ? (
          <div key={i} className={styles.quote}>
            <blockquote>
              <p dangerouslySetInnerHTML={{ __html: recordHtml(block.text, REPO_BLOB) }} />
            </blockquote>
            {copy && (
              <div className={styles.copy}>
                <CopyButton text={plainText(block.text)} label="Copy this text" />
              </div>
            )}
          </div>
        ) : (
          <p key={i} dangerouslySetInnerHTML={{ __html: recordHtml(block.text, REPO_BLOB) }} />
        ),
      )}
    </div>
  );
}

export default RecordText;
