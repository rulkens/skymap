/*
 * Sharing — Home's last section before the credits: a browser window with no frame, the app's address in its bar
 * over the view that address opens, one tab per view, ordered outward from Earth. Left alone the window moves on
 * to the next tab, and the new address types itself into the bar from where it differs from the last. The two
 * parts stand on the picture's foot, each under the name of the address's parameter it is about, in that
 * parameter's colour in the bar. The bar leaves out the camera's numbers (`pose`) behind a faint `…`; the link and
 * the copy keep them, so the view opens as shown. The words are the page's: the title, the line under it
 * (children) and the two parts'; the tabs are named with their views.
 */
import type { ReactNode } from 'react';

import { siteShot } from '../../../../data/siteShot.ts';
import { appAddress } from '../../../../utils/appAddress.ts';
import { cx } from '../../../../utils/cx.ts';
import { shownLink } from '../../../../utils/shownLink.ts';
import AddressText from '../../../shared/links/AddressText/AddressText.tsx';
import AppLink from '../../../shared/links/AppLink/AppLink.tsx';
import CopyButton from '../../../shared/links/CopyButton/CopyButton.tsx';
import OpenApp from '../../../shared/links/OpenApp/OpenApp.tsx';
import { useGallery } from '../../../shared/media/gallery/useGallery.ts';
import { useGalleryMarks } from '../../../shared/media/gallery/useGalleryMarks.ts';
import changing from '../../../shared/media/gallery/viewChange.module.css';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Sharing.module.css';
import { useTyped } from './useTyped.ts';
import { VIEWS, INKS, SIZES } from './Sharing.constants.ts';

type SharingProps = {
  title: string;
  /** The part under `focus=`, and the part under `t=`: each a title and a line. */
  focus: { title: string; text: string };
  clock: { title: string; text: string };
  children: ReactNode;
};

function Sharing({ title, focus, clock, children }: SharingProps) {
  const gallery = useGallery(VIEWS);
  const { at, live, byReader, layers, warmed } = gallery;
  const marks = useGalleryMarks(gallery);
  const now = live ? at : 0;
  const link = siteShot(VIEWS[now]!.id).link;
  const typed = useTyped(shownLink(link));

  return (
    <section ref={gallery.root} className={styles.root} id="sharing">
      <div className={styles.head}>
        <h2>{title}</h2>
        {children}
      </div>
      <div className={styles.window}>
        <div className={styles.chrome}>
          <div className={styles.tabs} {...marks.group}>
            {VIEWS.map((view, i) => (
              <button key={view.id} className={styles.tab} {...marks.mark(i)}>
                {view.tab}
              </button>
            ))}
          </div>
          <div className={styles.bar}>
            <AppLink className={styles.address} view={link}>
              <AddressText
                hash={typed}
                head={styles.host}
                param={(key) => ({ className: INKS[key] })}
              />
            </AppLink>
            <CopyButton text={appAddress(link)} label="Copy the address" />
          </div>
        </div>
        <div className={styles.stage}>
          {VIEWS.map((view, i) => (
            <div
              key={view.id}
              ref={(el) => {
                layers.current[i] = el;
              }}
              className={cx(styles.layer, i !== now && styles.away, !warmed(i) && styles.cold)}
            >
              <Shot id={view.id} sizes={SIZES} eager={i > 0 && warmed(i)} />
            </div>
          ))}
        </div>
        <div className={styles.foot}>
          {/* A change nobody asked for is not read out: a label announced every few seconds talks over the page. */}
          <div className={styles.labels} aria-live={live && !byReader ? 'off' : 'polite'}>
            {VIEWS.map((view, i) => (
              <div key={view.id} className={cx(changing.view, i !== now && changing.away)}>
                <ShotCaption id={view.id} showDrawn={false} open={false} />
              </div>
            ))}
          </div>
          <div className={cx(styles.part, styles.focus)}>
            <code>focus=</code>
            <h3>{focus.title}</h3>
            <p>{focus.text}</p>
          </div>
          <div className={cx(styles.part, styles.clock)}>
            <code>t=</code>
            <h3>{clock.title}</h3>
            <p>{clock.text}</p>
          </div>
          <div className={styles.open}>
            <OpenApp />
          </div>
        </div>
      </div>
    </section>
  );
}

export default Sharing;
