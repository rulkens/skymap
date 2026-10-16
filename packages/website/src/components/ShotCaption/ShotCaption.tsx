/*
 * ShotCaption — a picture's label, set as a museum sets an object's: a rule
 * with an arm that rises to the picture, the title, one sentence, then what is
 * data and what is drawn, the credit for third-party imagery in frame, and the
 * address the picture was taken at. Every picture being an address is the
 * site's honesty device. It is set quietly, as a caption: nothing in it is
 * brighter than the page's body text. It lays itself out by the room it is
 * given: stacked under a narrow picture, in two columns along the foot of a wide one.
 * `label` gives the words for a picture that is not in the manifest and is
 * not a view of the app: it has no address to open.
 */
import type { SiteShot } from '../../@types/SiteShot';
import { appLink } from '../../data/appLink.ts';
import { siteShot } from '../../data/siteShot.ts';
import { cx } from '../../utils/cx.ts';
import ViewLink from '../ViewLink/ViewLink.tsx';
import styles from './ShotCaption.module.css';

type ShotCaptionProps = {
  id?: string;
  label?: Pick<SiteShot, 'title' | 'caption' | 'credit'>;
  open?: boolean;
};

function ShotCaption({ id, label, open = true }: ShotCaptionProps) {
  const row = id === undefined ? undefined : siteShot(id);
  const shot: Pick<SiteShot, 'title' | 'caption' | 'drawn' | 'credit'> | undefined = row ?? label;
  if (!shot) throw new Error('ShotCaption needs the id of a shot or a label');
  // The view a manifest picture was taken at, where the label is to open it.
  const view = row && open ? row : undefined;
  const notes = Boolean(shot.drawn || shot.credit);
  // `caption` too: the name an .astro host's `:global(.caption)` rule selects, until the last host is rewritten.
  return (
    <div className={`caption ${styles.root}`}>
      <div className={styles.plate}>
        <p className={cx(styles.what, !notes && styles.alone)}>
          <strong>{shot.title}</strong>
          {shot.caption && <span>{shot.caption}</span>}
        </p>
        {notes && (
          <div className={styles.notes}>
            {shot.drawn && (
              <dl>
                <dt>Data and drawing</dt>
                <dd>{shot.drawn}</dd>
              </dl>
            )}
            {shot.credit && (
              <dl>
                <dt>Credit</dt>
                <dd>{`${shot.credit}.`}</dd>
              </dl>
            )}
          </div>
        )}
        {view &&
          (view.link.startsWith('tour=') ? (
            <ViewLink className={styles.view} href={appLink(view.link, view.query)}>
              Start the tour
            </ViewLink>
          ) : (
            <ViewLink className={styles.view} href={appLink(view.link, view.query)} />
          ))}
        {!row && <div className={styles.room} />}
      </div>
    </div>
  );
}

export default ShotCaption;
