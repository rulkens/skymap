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
import FeaturedCardTip from './FeaturedCardTip';
import { pickProperName } from './utils/pickProperName';
import { resolveFeaturedEntries } from './utils/resolveFeaturedEntries';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import styles from './FeaturedGrid.module.css';

export type FeaturedGridProps = {
  readonly entries: readonly FamousGalaxyMetaEntry[];
  readonly onSelect: (entry: FamousGalaxyMetaEntry) => void;
};

function FeaturedGrid({ entries, onSelect }: FeaturedGridProps): ReactNode {
  const featuredEntries = useMemo(() => resolveFeaturedEntries(entries), [entries]);

  if (featuredEntries.length === 0) return null;
  return (
    <ul className={styles.root} aria-label="Featured galaxies">
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
                className={styles.card}
                onClick={() => onSelect(entry)}
                aria-label={`Focus ${properName}`}
              >
                <img
                  className={styles.thumb}
                  src={`/images/famous/${entry.id}.webp`}
                  alt=""
                  loading="lazy"
                />
                <span className={styles.name}>{properName}</span>
              </button>
            </InfoTip>
          </li>
        );
      })}
    </ul>
  );
}

export default FeaturedGrid;
