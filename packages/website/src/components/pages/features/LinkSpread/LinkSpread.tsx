/*
 * LinkSpread — the Features page's last part, Deep linking: one link and the view it opens. The view floats
 * frameless with the app's card and clock lifted off it, each at its own depth, and the address lies across the
 * view's foot, printed without the camera's numbers as Home's bar prints it (shownLink); the link and the copy keep
 * them. The pieces drift against the view as the page scrolls and lean from the pointer, the card the most.
 */
import { requireShotLink } from '../../../../utils/requireShotLink.ts';
import { cx } from '../../../../utils/cx.ts';
import { shownLink } from '../../../../utils/shownLink.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import AddressStrip from '../../../shared/links/AddressStrip/AddressStrip.tsx';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './LinkSpread.module.css';
import { RENDER, RENDER_SIZES, CARD_SIZES, CLOCK_SIZES } from './LinkSpread.constants.ts';

type LinkSpreadProps = {
  title: string;
  line: string;
  href: string;
  label: string;
};

function LinkSpread({ title, line, href, label }: LinkSpreadProps) {
  const link = requireShotLink(RENDER);

  return (
    <section className={styles.root}>
      <div className={styles.words}>
        <h2>{title}</h2>
        <p className={styles.line}>{line}</p>
        <ObjLink size="small" hang href={sitePath(href)}>
          {label}
        </ObjLink>
      </div>
      <figure className={styles.figure}>
        <div className={styles.stage} data-turn>
          <div className={styles.view}>
            <Shot id={RENDER} sizes={RENDER_SIZES} />
          </div>
          <div className={cx(styles.piece, styles.card)}>
            <Shot id="features-link-card" sizes={CARD_SIZES} />
          </div>
          <div className={cx(styles.piece, styles.clock)}>
            <Shot id="features-link-clock" sizes={CLOCK_SIZES} />
          </div>
        </div>
        <div className={styles.bar}>
          <AddressStrip hash={link} shown={shownLink(link)} />
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id={RENDER} showDrawn={false} />
        </figcaption>
      </figure>
    </section>
  );
}

export default LinkSpread;
