/**
 * FeaturedCard — one card in the palette's browse grid: an InfoTip-wrapped
 * button showing the card's image (or, once it 404s, a dashed text tile) plus
 * its name. Owns its own image-failed state so a missing thumbnail is a local
 * concern, not something the grid or its parent needs to track per card.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import cx from 'classnames';
import { InfoTip } from '../InfoTip/InfoTip';
import FeaturedCardTip from './FeaturedCardTip';
import { cardImageSrc } from './utils/cardImageSrc';
import type { PaletteCard } from '../../@types/palette/PaletteCard';
import type { PaletteAction } from '../../@types/palette/PaletteAction';
import styles from './FeaturedCard.module.css';

export type FeaturedCardProps = {
  readonly card: PaletteCard;
  readonly aliases: readonly string[];
  readonly active: boolean;
  readonly onSelect: (action: PaletteAction) => void;
};

function FeaturedCard({ card, aliases, active, onSelect }: FeaturedCardProps): ReactNode {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <li className={styles.root}>
      {/* 'auto', not 'bottom': the panel's backdrop-filter makes it the tip's
          containing block and it clips, so bottom-row tips must flip upward. */}
      <InfoTip
        interactive
        title={card.label}
        body={<FeaturedCardTip aliases={aliases} blurb={card.blurb} />}
      >
        <button
          type="button"
          className={cx(styles.card, imageFailed && styles.cardFallback, active && styles.active)}
          onClick={() => onSelect(card.action)}
          aria-label={card.label}
          aria-current={active ? true : undefined}
          // Placeholder until PR3 wires up the view feature.
          disabled={card.action.kind === 'view'}
        >
          {imageFailed ? (
            <span className={styles.fallbackLabel}>{card.label}</span>
          ) : (
            <>
              <img
                className={styles.thumb}
                src={cardImageSrc(card)}
                alt=""
                loading="lazy"
                onError={() => setImageFailed(true)}
              />
              <span className={styles.name}>{card.label}</span>
            </>
          )}
        </button>
      </InfoTip>
    </li>
  );
}

export default FeaturedCard;
