/*
 * DesktopSpread — the Features page's desktop part, laid open: a render of the Andromeda Galaxy across the page
 * with two pieces of the app's interface, taken on a clear ground, standing off it at different depths. The
 * Navigation panel (the mouse and the keyboard) hangs from its lower left and the galaxy's card from its upper
 * right, as they sit in the app; the three move apart a little as the page scrolls, and lean away from the
 * pointer, the nearer card the most, so the depth can be felt.
 */
import type { PointerEvent } from 'react';

import { sitePath } from '../../../../utils/sitePath.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './DesktopSpread.module.css';

type DesktopSpreadProps = {
  title: string;
  line: string;
  href: string;
  label: string;
};

const RENDER = 'features-andromeda';
// Ten of the page grid's twelve columns, the window's width on a phone.
const RENDER_SIZES = '(max-width: 900px) 100vw, min(calc(83vw - 4rem), 64rem)';
const PIECE_SIZES = '(max-width: 900px) 48vw, 20rem';

// The pointer's place over the stage, -1 to 1 each way from its middle (0 once it leaves), for the pieces to lean by.
const lean = (event: PointerEvent<HTMLDivElement>): void => {
  const stage = event.currentTarget;
  const box = stage.getBoundingClientRect();
  const inside = event.type === 'pointermove';
  const x = inside ? ((event.clientX - box.left) / box.width) * 2 - 1 : 0;
  const y = inside ? ((event.clientY - box.top) / box.height) * 2 - 1 : 0;
  stage.style.setProperty('--lean-x', x.toFixed(3));
  stage.style.setProperty('--lean-y', y.toFixed(3));
};

function DesktopSpread({ title, line, href, label }: DesktopSpreadProps) {
  return (
    <section className={styles.root}>
      <div className={styles.words}>
        <h3 className={styles.title}>{title}</h3>
        <div>
          <p>{line}</p>
          <ObjLink size="small" hang href={sitePath(href)}>
            {label}
          </ObjLink>
        </div>
      </div>
      <figure className={styles.figure}>
        <div className={styles.stage} onPointerMove={lean} onPointerLeave={lean}>
          <div className={styles.render}>
            <Shot id={RENDER} sizes={RENDER_SIZES} />
          </div>
          <div className={styles.navigation}>
            <Shot id="ui-navigation" sizes={PIECE_SIZES} />
          </div>
          <div className={styles.card}>
            <Shot id="ui-card-andromeda" sizes={PIECE_SIZES} />
          </div>
          {/* data/facts.ts, andromeda-distance. */}
          <p className={styles.reading}>
            <span className={styles.value}>2.5</span>
            <span className={styles.measure}>million light-years away</span>
          </p>
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id={RENDER} showDrawn={false} />
        </figcaption>
      </figure>
    </section>
  );
}

export default DesktopSpread;
