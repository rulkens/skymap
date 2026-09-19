/**
 * FeaturedGrid — the card grid the palette shows for the active browse tab
 * when it opens with no query, replacing the results list. Purely
 * presentational: it renders whatever `PaletteCard[]` it's handed and knows
 * nothing about galaxies, tabs, or the ranking pipeline.
 */
import type { ReactNode, RefObject } from 'react';
import FeaturedCard from './FeaturedCard';
import type { PaletteCard } from '../../@types/palette/PaletteCard';
import type { PaletteAction } from '../../@types/palette/PaletteAction';
import styles from './FeaturedGrid.module.css';

export type FeaturedGridProps = {
  readonly cards: readonly PaletteCard[];
  /** Resolves a card's tooltip aliases — the grid itself never reads a galaxy's fields. */
  readonly aliasesFor: (card: PaletteCard) => readonly string[];
  /** Keyboard highlight. */
  readonly activeIdx: number;
  readonly gridRef: RefObject<HTMLUListElement | null>;
  readonly label: string;
  readonly onSelect: (action: PaletteAction) => void;
};

function FeaturedGrid({
  cards,
  aliasesFor,
  activeIdx,
  gridRef,
  label,
  onSelect,
}: FeaturedGridProps): ReactNode {
  return (
    <ul ref={gridRef} className={styles.root} role="tabpanel" aria-label={label}>
      {cards.map((card, i) => (
        <FeaturedCard
          key={card.id}
          card={card}
          aliases={aliasesFor(card)}
          active={i === activeIdx}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

export default FeaturedGrid;
