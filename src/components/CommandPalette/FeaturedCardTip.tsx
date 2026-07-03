/**
 * FeaturedCardTip — the InfoTip body that hovers a featured-grid card.
 * Surfaces the same flavour of context the InfoCard would show if you actually
 * selected the galaxy: morphological type, every catalog designation it goes
 * by, and the curated one-paragraph description.  Lets users browse the grid by
 * hovering rather than having to commit a click to each card to read what it is.
 *
 * The "Also known as" line is the part the user explicitly asked for: when the
 * card face shows "Andromeda Galaxy", the tip body reveals that's also M31,
 * NGC 224, etc.
 */
import type { ReactNode } from 'react';
import styles from './FeaturedCardTip.module.css';

export type FeaturedCardTipProps = {
  readonly names: readonly string[];
  readonly description: string;
  readonly type: string;
};

function FeaturedCardTip({ names, description, type }: FeaturedCardTipProps): ReactNode {
  return (
    <div className={styles.root}>
      {type && <div className={styles.type}>{type}</div>}
      {names.length > 1 && (
        <div className={styles.aliases}>
          <span className={styles.aliasesLabel}>Also known as </span>
          {names.join(' · ')}
        </div>
      )}
      {description && <div className={styles.description}>{description}</div>}
    </div>
  );
}

export default FeaturedCardTip;
