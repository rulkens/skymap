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
  names: readonly string[];
  description: string;
  type: string;
};

export function FeaturedCardTip({ names, description, type }: FeaturedCardTipProps): ReactNode {
  return (
    <>
      {type && <div className={styles.tipType}>{type}</div>}
      {names.length > 1 && (
        <div className={styles.tipAliases}>
          <span className={styles.tipAliasesLabel}>Also known as </span>
          {names.join(' · ')}
        </div>
      )}
      {description && <div className={styles.tipDescription}>{description}</div>}
    </>
  );
}
