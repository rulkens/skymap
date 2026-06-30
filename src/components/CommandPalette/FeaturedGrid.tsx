/**
 * FeaturedGrid — the 5×3 thumbnail grid the palette shows above the results
 * list when it opens with no query.  Resolves the curated featured ids against
 * the loaded famous catalog, renders each as a hoverable card (InfoTip body),
 * and reports a click back up via `onSelect`.  Returns null when nothing
 * resolves so the shell can render the results list alone.
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { InfoTip } from '../InfoTip/InfoTip';
import { pickProperName } from './utils/pickProperName';
import { resolveFeaturedEntries } from './utils/resolveFeaturedEntries';
import type { FamousMetaEntry } from '../../@types/loading/FamousMetaEntry';
import styles from './CommandPalette.module.css';

/**
 * Body content for an InfoTip that hovers a featured-grid card.
 * Surfaces the same flavour of context the InfoCard would show if
 * you actually selected the galaxy: morphological type, every
 * catalog designation it goes by, and the curated one-paragraph
 * description.  Lets users browse the grid by hovering rather than
 * having to commit a click to each card to read what it is.
 *
 * The "Also known as" line is the part the user explicitly asked
 * for: when the card face shows "Andromeda Galaxy", the tip body
 * reveals that's also M31, NGC 224, etc.
 */
type FeaturedCardTipProps = {
  names: readonly string[];
  description: string;
  type: string;
};
function FeaturedCardTip({ names, description, type }: FeaturedCardTipProps): ReactNode {
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

export type FeaturedGridProps = {
  entries: readonly FamousMetaEntry[];
  onSelect: (entry: FamousMetaEntry) => void;
};

export function FeaturedGrid({ entries, onSelect }: FeaturedGridProps): ReactNode {
  const featuredEntries = useMemo(() => resolveFeaturedEntries(entries), [entries]);

  if (featuredEntries.length === 0) return null;
  return (
    <ul className={styles.featuredGrid} aria-label="Featured galaxies">
      {featuredEntries.map((entry) => {
        const properName = pickProperName(entry.names);
        return (
          <li key={`featured:${entry.id}`}>
            <InfoTip
              interactive
              placement="bottom"
              title={properName}
              body={
                <FeaturedCardTip
                  names={entry.names}
                  description={entry.description}
                  type={entry.type}
                />
              }
            >
              <button
                type="button"
                className={styles.featuredCard}
                onClick={() => onSelect(entry)}
                aria-label={`Focus ${properName}`}
              >
                <img
                  className={styles.featuredThumb}
                  src={`/images/famous/${entry.id}.webp`}
                  alt=""
                  loading="lazy"
                />
                <span className={styles.featuredName}>{properName}</span>
              </button>
            </InfoTip>
          </li>
        );
      })}
    </ul>
  );
}
