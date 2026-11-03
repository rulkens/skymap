/*
 * SearchSpread — the Features page's Find your way around: the app's top bar, taken on a clear ground, with the
 * search it opens laid under it as a constellation's name leaves it, its list dissolving into the page. The keys
 * stand over the two ways the bar offers, `/` over the search box and `H` over the Home button, which wears the
 * app's selection ring as the way back. The search is nearer than the bar: it drifts on scroll and leans more.
 */
import { cx } from '../../../../utils/cx.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import {
  BAR,
  BAR_SIZES,
  HOME_KEY,
  PALETTE,
  PALETTE_SIZES,
  SEARCH_KEY,
} from './SearchSpread.constants.ts';
import styles from './SearchSpread.module.css';

type SearchSpreadProps = {
  title: string;
  line: string;
  href: string;
  label: string;
};

function SearchSpread({ title, line, href, label }: SearchSpreadProps) {
  return (
    <section className={styles.root}>
      <div className={styles.words}>
        <h2>{title}</h2>
        <p className={styles.line}>{line}</p>
        <ObjLink size="small" hang href={sitePath(href)}>
          {label}
        </ObjLink>
      </div>
      <figure className={styles.figure} data-turn>
        <div className={styles.bar}>
          <div className={styles.lean}>
            <p className={cx(styles.tag, styles.searchTag)}>
              <kbd>{SEARCH_KEY.key}</kbd> {SEARCH_KEY.does}
            </p>
            <p className={cx(styles.tag, styles.homeTag)}>
              <kbd>{HOME_KEY.key}</kbd> {HOME_KEY.does}
            </p>
            <Shot id={BAR} sizes={BAR_SIZES} />
            <span className={styles.ring} aria-hidden="true" />
          </div>
        </div>
        <div className={styles.palette}>
          <div className={cx(styles.lean, styles.clip)}>
            <Shot id={PALETTE} sizes={PALETTE_SIZES} />
          </div>
        </div>
      </figure>
    </section>
  );
}

export default SearchSpread;
