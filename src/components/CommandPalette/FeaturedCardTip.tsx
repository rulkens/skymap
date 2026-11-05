/**
 * FeaturedCardTip — the InfoTip body that hovers a featured-grid card: the
 * alias line (when the card resolves to a famous entry) plus the curated
 * blurb. Lets a user browse the grid by hovering rather than having to click
 * each card to see what it is.
 *
 * The "Also known as" line is what the user explicitly asked for: when the
 * card face shows "Andromeda Galaxy", the tip body reveals that's also M31,
 * NGC 224, etc.
 */
import type { ReactNode } from 'react';
import styles from './FeaturedCardTip.module.css';

export type FeaturedCardTipProps = {
  readonly aliases: readonly string[];
  readonly blurb: string;
};

function FeaturedCardTip({ aliases, blurb }: FeaturedCardTipProps): ReactNode {
  return (
    <div className={styles.root}>
      {aliases.length > 0 && (
        <div className={styles.aliases}>
          <span className={styles.aliasesLabel}>Also known as </span>
          {aliases.join(' · ')}
        </div>
      )}
      <div className={styles.blurb}>{blurb}</div>
    </div>
  );
}

export default FeaturedCardTip;
