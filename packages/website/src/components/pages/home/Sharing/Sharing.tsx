/*
 * Sharing — Home's last section before the credits: a browser window with no frame, the app's address in its bar
 * over the view that address opens, one tab per view, ordered outward from Earth. Left alone the window moves on
 * to the next tab, and the new address types itself into the bar from where it differs from the last. The two
 * parts stand on the picture's foot, each under the name of the address's parameter it is about, in that
 * parameter's colour in the bar. The bar leaves out the camera's numbers (`pose`) behind a faint `…`; the link and
 * the copy keep them, so the view opens as shown.
 */
import type { KeyboardEvent } from 'react';
import { useRef } from 'react';

import { APP_BASE, APP_TAB, appLink } from '../../../../data/appLink.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import { galleryKeyTarget } from '../../../../utils/galleryKeyTarget.ts';
import { wrapIndex } from '../../../../utils/wrapIndex.ts';
import CopyButton from '../../../shared/links/CopyButton/CopyButton.tsx';
import OpenApp from '../../../shared/links/OpenApp/OpenApp.tsx';
import { useGallery } from '../../../shared/media/PictureBand/useGallery.ts';
import changing from '../../../shared/media/PictureBand/viewChange.module.css';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Sharing.module.css';
import { useTyped } from './useTyped.ts';

const VIEWS = [
  { id: 'hubble', tab: 'Hubble' },
  { id: 'privacy-far-side', tab: 'Moon' },
  { id: 'saturn', tab: 'Saturn' },
  { id: 'features-s-stars', tab: 'S-stars' },
];
// The parameters the parts are about, each in its own colour.
const INKS: Record<string, string | undefined> = { focus: styles.focus, t: styles.clock };
// The window's width; on a phone its 4:3 stage is cut from 16:9 pictures, so a third wider.
const SIZES = '(max-width: 900px) 133vw, 100vw';

function Sharing() {
  const gallery = useGallery(VIEWS);
  const { at, live, byReader, choose, marksRef, layers, warmed } = gallery;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const now = live ? at : 0;
  const link = siteShot(VIEWS[now]!.id).link;
  const pairs = link.split('&');
  const kept = pairs.filter((pair) => !pair.startsWith('pose='));
  const typed = useTyped(kept.join('&') + (kept.length < pairs.length ? '&…' : ''));
  const site = new URL(import.meta.env.SITE);

  const onKeyDown = (event: KeyboardEvent) => {
    const to = galleryKeyTarget(event.key, at, VIEWS.length - 1);
    if (to === at) return;
    event.preventDefault();
    choose(to);
    tabs.current[wrapIndex(to, VIEWS.length)]?.focus();
  };

  return (
    <section ref={gallery.root} className={styles.root} id="sharing">
      <div className={styles.head}>
        <h2>Wish you were here</h2>
        <p className={styles.lead}>
          Copy the address of any view and send it. It opens on the same view for whoever follows
          it.
        </p>
      </div>
      <div className={styles.window}>
        <div className={styles.chrome}>
          <div ref={marksRef} className={styles.tabs} role="group" aria-label="Views">
            {VIEWS.map((view, i) => (
              <button
                key={view.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                className={styles.tab}
                type="button"
                title={siteShot(view.id).title}
                aria-pressed={i === now}
                tabIndex={i === now ? 0 : -1}
                onClick={() => choose(i)}
                onKeyDown={onKeyDown}
              >
                {view.tab}
              </button>
            ))}
          </div>
          <div className={styles.bar}>
            <a className={styles.address} href={appLink(link)} {...APP_TAB}>
              <span className={styles.host}>
                {site.host}
                {APP_BASE}#
              </span>
              {typed.split('&').map((pair, i) => (
                <span key={i} className={INKS[pair.split('=')[0]!]}>
                  {i > 0 && '&'}
                  {pair}
                </span>
              ))}
            </a>
            <CopyButton text={site.origin + appLink(link)} label="Copy the address" />
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
            <h3>Every view is a link</h3>
            <p>
              The address holds the view: the object in focus and where the camera is. There is no
              share button; the address is the link.
            </p>
          </div>
          <div className={cx(styles.part, styles.clock)}>
            <code>t=</code>
            <h3>A place and a moment</h3>
            <p>
              A link can also set the clock. The planets, moons and spacecraft then stand where they
              were at that moment.
            </p>
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
