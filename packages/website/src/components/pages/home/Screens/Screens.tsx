/*
 * Screens — Home's row of the screens Skymap runs on, each showing Saturn: a phone, a tablet, a desktop and a
 * dome, rising in size from the phone to the dome on one floor line, each with the depth of a case. Each turns
 * toward the pointer from where it stands and shifts against it by its size, and all turn a little with the
 * scroll (phoneTurn.client.ts sets the pointer's offset on the row). Wide, the title is centred over the row, the
 * page's one centred head, and the planet they all show floats free beside it, drifting a little with the scroll.
 * Narrow, the row is two by two.
 */
import type { CSSProperties } from 'react';

import { appLink } from '../../../../data/appLink.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import DeviceFrame from '../../../shared/media/DeviceFrame/DeviceFrame.tsx';
import Disc from '../../../shared/media/Disc/Disc.tsx';
import Phone3D from '../../../shared/media/Phone3D/Phone3D.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './Screens.module.css';

// The case behind a flat device: as many slices as the phone's, one pixel apart. The phone draws its own.
const SLICES = 9;

const PARTS = [
  {
    kind: 'phone',
    title: 'Phone',
    note: 'In the phone’s browser, moved with your fingers.',
    device: <Phone3D shot="features-phone" follow={false} />,
  },
  {
    kind: 'tablet',
    title: 'Tablet',
    note: 'The same view on a larger touch screen.',
    device: (
      <DeviceFrame device="tablet" shot="saturn-portrait" sizes="(max-width: 900px) 30vw, 14rem" />
    ),
  },
  {
    kind: 'desktop',
    title: 'Desktop',
    note: 'The full app, with a mouse and a keyboard.',
    device: (
      <DeviceFrame device="desktop" shot="start-saturn" sizes="(max-width: 900px) 50vw, 23rem" />
    ),
  },
  {
    kind: 'dome',
    title: 'Dome',
    note: 'A fisheye picture for a planetarium dome, steered from a phone.',
    device: <Disc id="dome-saturn" sizes="(max-width: 900px) 34vw, 23rem" />,
  },
];

function Screens() {
  return (
    <section className={styles.root} id="screens">
      <div className={styles.planet} aria-hidden>
        <Shot id="cut-saturn" sizes="48rem" alt="" />
      </div>
      <div className={styles.head}>
        <h2>Explore the universe anywhere</h2>
        <p>
          The same view of Saturn on four screens. Skymap runs in a browser, with nothing to
          install.
        </p>
        <ViewLink href={appLink(siteShot('start-saturn').link)}>Open Saturn</ViewLink>
      </div>
      <div className={styles.row} data-turn>
        {PARTS.map((part, at) => (
          <div
            key={part.kind}
            className={cx(styles.part, styles[part.kind])}
            style={{ '--reveal-delay': `${at * 40}ms` } as CSSProperties}
            data-reveal="rise"
          >
            <div className={styles.device}>
              <div className={styles.body}>
                {part.kind !== 'phone' &&
                  Array.from({ length: SLICES }, (_, i) => (
                    <span
                      key={i}
                      className={styles.slice}
                      style={{ transform: `translateZ(${-i - 1}px)` }}
                    />
                  ))}
                <div className={styles.face}>{part.device}</div>
              </div>
            </div>
            <div className={styles.label}>
              <h3>{part.title}</h3>
              <p className={styles.note}>{part.note}</p>
              {part.kind === 'dome' && (
                <ObjLink size="small" href={sitePath('/domes/')}>
                  Domes and museums
                </ObjLink>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default Screens;
