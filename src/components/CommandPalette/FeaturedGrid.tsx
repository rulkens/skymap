/**
 * FeaturedGrid — the card grid the palette shows for the active browse tab
 * when it opens with no query. Purely presentational: it renders whatever
 * `PaletteCard[]` it's handed and knows nothing about galaxies, tabs, or the
 * ranking pipeline. Returns null when the tab has no cards.
 */
import type { ReactNode, RefObject } from 'react';
import FeaturedCard from './FeaturedCard';
import { cardAliases } from './utils/cardAliases';
import type { PaletteCard } from '../../@types/palette/PaletteCard';
import type { PaletteAction } from '../../@types/palette/PaletteAction';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import styles from './FeaturedGrid.module.css';

export type FeaturedGridProps = {
  readonly cards: readonly PaletteCard[];
  /** For `cardAliases` only — the grid itself never reads a galaxy's fields. */
  readonly famous: readonly FamousGalaxyMetaEntry[];
  /** Keyboard highlight (wired in Task 6); -1 = none. */
  readonly activeIdx: number;
  readonly gridRef: RefObject<HTMLUListElement | null>;
  readonly label: string;
  readonly onSelect: (action: PaletteAction) => void;
};

function FeaturedGrid({
  cards,
  famous,
  activeIdx,
  gridRef,
  label,
  onSelect,
}: FeaturedGridProps): ReactNode {
  if (cards.length === 0) return null;
  return (
    <ul ref={gridRef} className={styles.root} role="tabpanel" aria-label={label}>
      {cards.map((card, i) => (
        <FeaturedCard
          key={card.id}
          card={card}
          aliases={cardAliases(card, famous)}
          active={i === activeIdx}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

export default FeaturedGrid;
