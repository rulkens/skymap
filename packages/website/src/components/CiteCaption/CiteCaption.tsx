/*
 * CiteCaption — the Cite page's worked example: what to print with one
 * picture made with Skymap. `picture` is a row of data/pressPictures.ts (its
 * credit line), `cite` the entries of the licence record whose
 * papers the picture rests on. The caption, the reference list and the
 * acknowledgements are put together from those rows, the shot's address and
 * the citation, so the example cannot fall behind any of them.
 */
import { APP_BASE } from '../../data/appLink.ts';
import { CITATION } from '../../data/citation.ts';
import { CITE_REFS } from '../../data/citeRefs.ts';
import { dataEntry } from '../../data/dataPages.ts';
import { PRESS_PICTURES } from '../../data/pressPictures.ts';
import { siteShot } from '../../data/siteShot.ts';
import { asksAcknowledgement } from '../../utils/asksAcknowledgement.ts';
import { citationText } from '../../utils/citationText.ts';
import CopyButton from '../CopyButton/CopyButton.tsx';
import DocLink from '../DocLink/DocLink.tsx';
import RefLine from '../RefLine/RefLine.tsx';
import styles from './CiteCaption.module.css';

type CiteCaptionProps = { picture: string; cite: readonly string[] };

function CiteCaption({ picture, cite }: CiteCaptionProps) {
  const press = PRESS_PICTURES.find((row) => row.shot === picture);
  if (!press) throw new Error(`No press picture "${picture}" (see src/data/pressPictures.ts)`);
  const entries = cite.map((id) => {
    if (!CITE_REFS[id]) throw new Error(`No reference for "${id}" (see src/data/citeRefs.ts)`);
    return { ...dataEntry(id), references: CITE_REFS[id] };
  });
  // Two sources can ask for the same paper (the Gaia mission paper); it is listed once.
  const references = [...new Set(entries.flatMap((entry) => entry.references))];
  // The address as the app itself writes it: the camera's exact position is read once and never written back.
  const view = siteShot(picture)
    .link.split('&')
    .filter((part) => !part.startsWith('pose='))
    .join('&');
  const address = `${new URL(import.meta.env.SITE).host}${APP_BASE}#${view}`;
  const cited = `${CITATION.authors[0]!.family} ${CITATION.released.slice(0, 4)}`;
  const asking = entries.filter((entry) =>
    asksAcknowledgement(entry.record.fields.Attribution ?? ''),
  );
  const caption = `${siteShot(picture).title}. ${press.credit}. Made with Skymap ${CITATION.version} (${cited}), from the view at ${address}.`;

  return (
    <div className={styles.root} data-embed>
      <h3>Under the picture</h3>
      <div className={styles.row}>
        <p>
          {caption.replace(`${address}.`, '')}
          <span className={styles.address}>{address}</span>.
        </p>
        <div className={styles.copy}>
          <CopyButton text={caption} label="Copy the caption" />
        </div>
      </div>
      <h3>In the reference list</h3>
      <p>{citationText(CITATION)}</p>
      {references.map((reference, i) => (
        <p key={i}>
          <RefLine reference={reference} />
        </p>
      ))}
      {asking.length > 0 && (
        <>
          <h3>In the acknowledgements</h3>
          {asking.map((entry) => (
            <p key={entry.id}>
              The text {entry.title} asks for, which is{' '}
              <DocLink href={`/docs/credits/#${entry.id}`}>on the credits page</DocLink>.
            </p>
          ))}
        </>
      )}
    </div>
  );
}

export default CiteCaption;
