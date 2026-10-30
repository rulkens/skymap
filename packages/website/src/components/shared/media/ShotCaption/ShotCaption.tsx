/*
 * ShotCaption — a picture's label, the quietest words on the page: the title, then in one fainter line what
 * is data and what is drawn and the credit for third-party imagery in frame, then the address the picture was
 * taken at (every picture being an address is the site's honesty device). Use it where it adds something;
 * a picture whose words beside it already name it takes `showTitle={false}`, which keeps a credit and
 * renders nothing when there is none. `label` gives the words for a picture not in the manifest, with no
 * address to open; `showDrawn={false}` leaves out the data-and-drawing note; `foot` fills the height it is
 * given and sets the address at its foot, so the labels of a row of pictures put their addresses on one line.
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
  showTitle?: boolean;
  foot?: boolean;
};

function ShotCaption({
  id,
  label,
  open = true,
  showDrawn = true,
  showTitle = true,
  foot = false,
}: ShotCaptionProps) {
  const row = id === undefined ? undefined : siteShot(id);
  const shot: Pick<SiteShot, 'title' | 'drawn' | 'credit'> | undefined = row ?? label;
  if (!shot) throw new Error('ShotCaption needs the id of a shot or a label');
  // The view a manifest picture was taken at, where the label is to open it.
  const view = row && open ? row : undefined;
  const drawn = showDrawn ? shot.drawn : undefined;
  if (!showTitle && !drawn && !shot.credit && !view) return null;
  return (
    <div className={cx(styles.root, foot && styles.foot)}>
      {showTitle && <p className={styles.title}>{shot.title}</p>}
      {(drawn || shot.credit) && (
        <p className={styles.notes}>
          {drawn}
          {drawn && shot.credit && ' '}
          {shot.credit && `Credit: ${shot.credit}.`}
        </p>
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
  );
}

export default ShotCaption;
