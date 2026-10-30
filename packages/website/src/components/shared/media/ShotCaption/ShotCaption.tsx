/*
 * ShotCaption — a picture's label, set as a museum sets an object's: a rule with an arm that rises to the
 * picture, the title, then what is data and what is drawn, the credit for third-party imagery in frame, and
 * the address the picture was taken at (every picture being an address is the site's honesty device). Set
 * quietly, it lays itself out by the room it is given: stacked under a narrow picture, in two columns under
 * a wide one. `label` gives the words for a picture not in the manifest, with no address to open;
 * `showDrawn={false}` leaves out the data-and-drawing note; `foot` fills the height it is given and sets
 * the address at its foot, so the labels of a row of pictures put their addresses on one line.
 */
import type { SiteShot } from '../../../../@types/SiteShot';
import { appLink } from '../../../../data/appLink.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import ViewLink from '../../links/ViewLink/ViewLink.tsx';
import styles from './ShotCaption.module.css';

type ShotCaptionProps = {
  id?: string;
  label?: Pick<SiteShot, 'title' | 'credit'>;
  open?: boolean;
  showDrawn?: boolean;
  foot?: boolean;
};

function ShotCaption({ id, label, open = true, showDrawn = true, foot = false }: ShotCaptionProps) {
  const row = id === undefined ? undefined : siteShot(id);
  const shot: Pick<SiteShot, 'title' | 'drawn' | 'credit'> | undefined = row ?? label;
  if (!shot) throw new Error('ShotCaption needs the id of a shot or a label');
  // The view a manifest picture was taken at, where the label is to open it.
  const view = row && open ? row : undefined;
  const drawn = showDrawn ? shot.drawn : undefined;
  const notes = Boolean(drawn || shot.credit);
  return (
    <div className={cx(styles.root, foot && styles.foot)}>
      <div className={styles.plate}>
        <p className={cx(styles.what, !notes && styles.alone)}>
          <strong>{shot.title}</strong>
        </p>
        {notes && (
          <div className={styles.notes}>
            {drawn && (
              <dl>
                <dt>Data and drawing</dt>
                <dd>{drawn}</dd>
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
