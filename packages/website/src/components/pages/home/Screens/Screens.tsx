/*
 * Screens — Home's row of the screens Skymap runs on, each showing Saturn: a phone, a tablet, a desktop and a
 * dome, rising in size from the phone to the dome on one floor line, each with the depth of a case. Each faces
 * the pointer on its own from where it stands, none moving, and all turn a little with the scroll
 * (styles/pointer.client.ts sets each device's look). Wide, the title is centred over the row, the
 * page's one centred head, and the planet they all show floats free beside it, drifting a little with the scroll.
 * Narrow, the row is two by two.
 */
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import { revealDelay } from '../../../../utils/revealDelay.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './Screens.module.css';
import ScreenDevice from './ScreenDevice.tsx';
import { PARTS, SLICES } from './Screens.constants.ts';

function Screens() {
  return (
    <section className={styles.root} id="screens">
      <div className={styles.planet} aria-hidden>
        <Shot id="cut-saturn" sizes="48rem" alt="" />
      </div>
      <div className={styles.head}>
        <h2>
          Explore the universe <br />
          from anywhere
        </h2>
        <p>
          The same view of Saturn on four screens. Skymap runs in a browser, with nothing to
          install.
        </p>
        <ViewLink view={siteShot('start-saturn').link}>Open Saturn</ViewLink>
      </div>
      <div className={styles.row}>
        {PARTS.map((part, at) => (
          <div
            key={part.kind}
            className={cx(styles.part, styles[part.kind])}
            style={revealDelay(at * 40)}
            data-reveal="rise"
          >
            <div className={styles.device} data-look>
              <div className={styles.body}>
                {part.kind !== 'phone' &&
                  Array.from({ length: SLICES }, (_, i) => (
                    <span
                      key={i}
                      className={styles.slice}
                      style={{ transform: `translateZ(${-i - 1}px)` }}
                    />
                  ))}
                <div className={styles.face}>
                  <ScreenDevice kind={part.kind} />
                </div>
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
