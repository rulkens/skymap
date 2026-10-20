/* RefLine — one paper or dataset as a reference list prints it, with its DOI and arXiv links, from a row of data/citeRefs.ts. The title is in quotation marks: the text face has no italic. */
import type { CiteRef } from '../../@types/CiteRef';
import styles from './RefLine.module.css';

type RefLineProps = { reference: CiteRef };

function RefLine({ reference }: RefLineProps) {
  return (
    <>
      {reference.authors} ({reference.year}). “{reference.title}”. {reference.journal}.{' '}
      {reference.doi && (
        <a className={styles.id} href={`https://doi.org/${reference.doi}`}>
          doi:{reference.doi}
        </a>
      )}{' '}
      {reference.arxiv && (
        <a className={styles.id} href={`https://arxiv.org/abs/${reference.arxiv}`}>
          arXiv:{reference.arxiv}
        </a>
      )}
    </>
  );
}

export default RefLine;
