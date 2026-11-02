/*
 * LinkSpread — the Features page's last part, Deep linking: one link taken apart. The view it opens floats frameless
 * with the app's card and clock lifted off it, each at its own depth, and the address lies across the view's foot.
 * Each of the address's three parameters names the piece it sets (`focus` the card, `t` the clock, `pose` the view
 * itself) in a tag beside that piece; pointing at a parameter or a piece lights the pair. The pieces drift against
 * the view as the page scrolls and lean from the pointer, the card the most.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';

import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import AddressStrip from '../../../shared/links/AddressStrip/AddressStrip.tsx';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './LinkSpread.module.css';
import {
  RENDER,
  ACCENT,
  RENDER_SIZES,
  CARD_SIZES,
  CLOCK_SIZES,
  WORDS,
} from './LinkSpread.constants.ts';

type LinkSpreadProps = {
  title: string;
  line: string;
  href: string;
  label: string;
};

function LinkSpread({ title, line, href, label }: LinkSpreadProps) {
  const [lit, setLit] = useState<string | null>(null);
  const link = siteShot(RENDER).link;
  // Pointing at either half of a pair lights both and lets the other two fall back.
  const pair = (key: string) => ({
    onPointerEnter: () => setLit(key),
    onPointerLeave: () => setLit(null),
  });
  const state = (key: string) =>
    cx(lit === key && styles.on, lit !== null && lit !== key && styles.off);
  const tag = (key: string) => (
    <p className={styles.tag}>
      <code>{key}</code> {WORDS[key]}
    </p>
  );

  return (
    <section className={styles.root} style={{ '--link-accent': ACCENT } as CSSProperties}>
      <div className={styles.words}>
        <h2>{title}</h2>
        <p className={styles.line}>{line}</p>
        <ObjLink size="small" hang href={sitePath(href)}>
          {label}
        </ObjLink>
      </div>
      <figure className={styles.figure}>
        <div className={styles.stage} data-turn>
          <div className={cx(styles.view, state('pose'))} {...pair('pose')}>
            <Shot id={RENDER} sizes={RENDER_SIZES} />
            {tag('pose')}
          </div>
          <div className={cx(styles.piece, styles.card, state('focus'))} {...pair('focus')}>
            <div className={styles.lean}>
              {tag('focus')}
              <Shot id="features-link-card" sizes={CARD_SIZES} />
            </div>
          </div>
          <div className={cx(styles.piece, styles.clock, state('t'))} {...pair('t')}>
            <div className={styles.lean}>
              {tag('t')}
              <Shot id="features-link-clock" sizes={CLOCK_SIZES} />
            </div>
          </div>
        </div>
        <div className={styles.bar}>
          <AddressStrip
            hash={link}
            param={(key) => ({ className: cx(styles.param, state(key)), ...pair(key) })}
          />
        </div>
        <figcaption className={styles.caption}>
          <ShotCaption id={RENDER} showDrawn={false} />
        </figcaption>
      </figure>
    </section>
  );
}

export default LinkSpread;
