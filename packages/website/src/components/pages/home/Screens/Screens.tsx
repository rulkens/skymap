/*
 * Screens — Home's row of the screens Skymap runs on, each showing Saturn: a phone, a tablet, a desktop and a
 * dome, rising in size from the phone to the dome on one floor line, each with the depth of a case. Each faces
 * the pointer on its own from where it stands, none moving, and all turn a little with the scroll
 * (styles/pointer.client.ts sets each device's look). Wide, the title is centred over the row, the
 * page's one centred head, and the planet they all show floats free beside it, drifting a little with the scroll.
 * Narrow, the row is two by two. The words are the page's: the title (a slot, for its line break), the line
 * under it (children), the link's words and each device's.
 */
import type { ReactNode } from 'react';

import { shotLink } from '../../../../utils/shotLink.ts';
import { cx } from '../../../../utils/cx.ts';
import { revealDelay } from '../../../../utils/revealDelay.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import { SLICES } from '../../../shared/media/Phone3D/Phone3D.constants.ts';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './Screens.module.css';
import ScreenDevice from './ScreenDevice.tsx';
import { KINDS } from './Screens.constants.ts';

type ScreensProps = {
  title: ReactNode;
  /** The words of the link to Saturn in the app. */
  action: string;
  /** Each device's name, its note and, for one, a link on. */
  devices: Record<
    (typeof KINDS)[number],
    { title: string; note: string; link?: { label: string; href: string } }
  >;
  children: ReactNode;
};

function Screens({ title, action, devices, children }: ScreensProps) {
  return (
    <section className={styles.root} id="screens">
      <div className={styles.planet} aria-hidden>
        <Shot id="cut-saturn" sizes="48rem" alt="" />
      </div>
      <div className={styles.head}>
        <h2>{title}</h2>
        {children}
        <ViewLink view={shotLink('start-saturn')}>{action}</ViewLink>
      </div>
      <div className={styles.row}>
        {KINDS.map((kind, at) => {
          const { title: name, note, link } = devices[kind];
          return (
            <div
              key={kind}
              className={cx(styles.part, styles[kind])}
              style={revealDelay(at * 40)}
              data-reveal="rise"
            >
              <div className={styles.device} data-look>
                <div className={styles.body}>
                  {kind !== 'phone' &&
                    Array.from({ length: SLICES }, (_, i) => (
                      <span
                        key={i}
                        className={styles.slice}
                        style={{ transform: `translateZ(${-i - 1}px)` }}
                      />
                    ))}
                  <div className={styles.face}>
                    <ScreenDevice kind={kind} />
                  </div>
                </div>
              </div>
              <div className={styles.label}>
                <h3>{name}</h3>
                <p className={styles.note}>{note}</p>
                {link && (
                  <ObjLink size="small" href={link.href}>
                    {link.label}
                  </ObjLink>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default Screens;
