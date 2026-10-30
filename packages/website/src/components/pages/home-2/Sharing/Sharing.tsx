/*
 * Sharing — Home's last section before the credits: a browser window with no frame, the app's address in its bar
 * over the view that address opens. Each of the two parts is a view; the one being read (pointed at, focused, or
 * left alone for a while) fills the window, and its address types itself into the bar from where it differs
 * from the last, the part of the address the part is about lit in its picture's colour. Then the way in.
 */
import { Fragment } from 'react';
import type { CSSProperties } from 'react';

import { APP_BASE, appLink } from '../../../../data/appLink.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import CopyButton from '../../../shared/links/CopyButton/CopyButton.tsx';
import OpenApp from '../../../shared/links/OpenApp/OpenApp.tsx';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import CaptionGallery from '../../../shared/media/CaptionGallery/CaptionGallery.tsx';
import { GalleryContext } from '../../../shared/media/PictureBand/GalleryContext.ts';
import { useGallery } from '../../../shared/media/PictureBand/useGallery.ts';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import styles from './Sharing.module.css';
import { useTyped } from './useTyped.ts';

// In the parts' order. `lit` names the address's parameters the part is about; `accent` is from the picture:
// the ocean under the telescope, Saturn's gold.
const VIEWS = [
  { id: 'hubble', lit: ['focus', 'pose'], accent: '#8fb6ff' },
  { id: 'saturn', lit: ['t'], accent: '#e6c98f' },
];
const SIZES = '100vw';

function Sharing() {
  const gallery = useGallery(VIEWS);
  const { at, live, choose, layers, warmed } = gallery;
  const now = live ? at : 0;
  const view = VIEWS[now]!;
  const link = siteShot(view.id).link;
  const typed = useTyped(link);
  const site = new URL(import.meta.env.SITE);
  const current = (i: number) => i === now;
  const show = (i: number) => () => {
    if (i !== at) choose(i);
  };

  return (
    <GalleryContext.Provider value={gallery}>
      <section
        ref={gallery.root}
        className={styles.root}
        id="sharing"
        style={{ '--view-accent': view.accent } as CSSProperties}
      >
        <div className={styles.head}>
          <h2>Ready for sharing</h2>
          <p className={styles.lead}>
            Copy the address of any view and send it. It opens on the same view for whoever follows
            it.
          </p>
        </div>
        <figure className={styles.window}>
          <div className={styles.bar}>
            <a className={styles.address} href={appLink(link)}>
              <span className={styles.host}>
                {site.host}
                {APP_BASE}#
              </span>
              {typed.split('&').map((pair, i) => {
                const [key, value = ''] = pair.split('=');
                return (
                  <span key={i} className={cx(view.lit.includes(key!) && styles.lit)}>
                    {i > 0 && '&'}
                    {key}
                    {pair.includes('=') && '='}
                    <b>
                      {value.split(',').map((part, k) => (
                        <Fragment key={k}>
                          {k > 0 && (
                            <>
                              ,<wbr />
                            </>
                          )}
                          {part}
                        </Fragment>
                      ))}
                    </b>
                  </span>
                );
              })}
            </a>
            <CopyButton text={site.origin + appLink(link)} label="Copy the address" />
          </div>
          <div className={styles.stage}>
            {VIEWS.map((v, i) => (
              <div
                key={v.id}
                ref={(el) => {
                  layers.current[i] = el;
                }}
                className={cx(styles.layer, !current(i) && styles.away, !warmed(i) && styles.cold)}
              >
                <Shot id={v.id} sizes={SIZES} eager={i > 0 && warmed(i)} />
              </div>
            ))}
          </div>
          <figcaption className={styles.caption}>
            <CaptionGallery showDrawn={false} open={false} />
          </figcaption>
        </figure>
        <div className={styles.parts}>
          <div
            className={cx(styles.part, current(0) && styles.on)}
            onPointerEnter={show(0)}
            onFocus={show(0)}
          >
            <h3>Every view is a link</h3>
            <p>
              The address bar holds the view: the object in focus and where the camera is. There is
              no share button; the address is the link.
            </p>
          </div>
          <div
            className={cx(styles.part, current(1) && styles.on)}
            onPointerEnter={show(1)}
            onFocus={show(1)}
          >
            <h3>A place and a moment</h3>
            <p>
              A link can also set the clock. The planets, moons and spacecraft then stand where they
              were at that moment.
            </p>
            <ViewLink hang href={appLink(siteShot('saturn').link)}>
              Saturn on 15 October 2017
            </ViewLink>
          </div>
          <div className={styles.open}>
            <OpenApp />
          </div>
        </div>
      </section>
    </GalleryContext.Provider>
  );
}

export default Sharing;
