/*
 * Citation — how to cite Skymap, built from data/citation.ts (which reads
 * CITATION.cff), so a release changes it in one place. The short form is the
 * reference as a line of text with a way to the docs' Cite page; `full`, for
 * that page, adds the BibTeX entry as a block of code (CodeBlock) and the
 * citation file. Each text has the copy control an address has.
 */
import { CITATION } from '../../data/citation.ts';
import { fact } from '../../data/fact.ts';
import { REPO_URL } from '../../data/siteIdentity.ts';
import { citationBibtex } from '../../utils/citationBibtex.ts';
import { citationText } from '../../utils/citationText.ts';
import { sitePath } from '../../utils/sitePath.ts';
import CodeBlock from '../CodeBlock/CodeBlock.tsx';
import CopyButton from '../CopyButton/CopyButton.tsx';
import styles from './Citation.module.css';

type CitationProps = { full?: boolean };

function Citation({ full = false }: CitationProps) {
  const doiUrl = `https://doi.org/${CITATION.versionDoi ?? CITATION.conceptDoi}`;
  const text = citationText(CITATION);
  const bibtex = citationBibtex(CITATION, REPO_URL);

  return (
    <div className={styles.root} data-embed>
      <div className={styles.row}>
        <p className={styles.reference}>
          {text.replace(doiUrl, '')}
          <a href={doiUrl}>{doiUrl}</a>
        </p>
        <CopyButton text={text} label="Copy the reference" />
      </div>
      {full ? (
        <>
          <CodeBlock text={bibtex} label="Copy the BibTeX entry" />
          <p className={styles.note}>
            {fact('sci-cite-file').text} <a href={fact('sci-cite-file').source}>CITATION.cff</a>
          </p>
        </>
      ) : (
        <p className={styles.note}>
          {fact('sci-cite-skymap').text} The BibTeX entry, how to cite one view, and the papers to
          cite for each catalogue are on <a href={sitePath('/docs/cite/')}>the docs’ Cite page</a>.
        </p>
      )}
    </div>
  );
}

export default Citation;
