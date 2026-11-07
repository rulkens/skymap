/**
 * InfoCard — routes hovered/selected state into the detail and preview cards.
 *
 * Always the same outer wrapper: a tag change across the single↔pair transition
 * remounts the detail card and loses its `<details>` open state on every hover.
 * Dispatch is table-driven (`detailCardFor(DETAIL_CARD, target)`): a new
 * focusable kind is one table row. Slot precedence is the only logic here. On
 * the phone there is no hover, so only the selected target renders, as the bare
 * Detail body for the MobileSheet to wrap.
 */

import { useCallback } from 'react';
import type { ReactNode, Ref } from 'react';
import cx from 'classnames';
import { targetEq } from '../../services/engine/helpers/targetEq';
import { useIsMobile } from '../../hooks/useIsMobile';
import { APP_COMPOSITION } from '../../compositions/app';
import { detailCardTable } from './detailCardTable';
import { detailCardFor } from '../../utils/infoCard/detailCardFor';
import styles from './InfoCard.module.css';
import type { FocusableTargetBase } from '../../@types/engine/selection/FocusableTargetBase';

// Folded at module load so a missing arm throws at boot, not on the first hover.
const DETAIL_CARD = detailCardTable(APP_COMPOSITION.layers);

export type InfoCardProps = {
  /** The target under the cursor, or null on empty sky. */
  hovered: FocusableTargetBase | null;
  /** The pinned target, or null. Owns the detail slot; a different hovered target previews beneath. */
  selected: FocusableTargetBase | null;
  /** The pinned card's "Focus" pill. */
  onFocus?: (target: FocusableTargetBase) => void;
  /** The pinned card's Close (×); same as Esc. */
  onClose?: () => void;
  /** The desktop stack wrapper, for its view cover. */
  ref?: Ref<HTMLDivElement>;
};

function InfoCard({ hovered, selected, onFocus, onClose, ref }: InfoCardProps): ReactNode {
  const isMobile = useIsMobile();
  // Bound here so a card never rebuilds its target's identity; stable across hover changes.
  const focusSelected = useCallback(() => {
    if (selected !== null) onFocus?.(selected);
  }, [selected, onFocus]);
  const onFocusSelected = onFocus ? focusSelected : undefined;

  if (isMobile) {
    if (selected === null) return null;
    const { Detail } = detailCardFor(DETAIL_CARD, selected);
    return (
      <Detail
        target={selected}
        isPinned
        layout="phone"
        onFocus={onFocusSelected}
        onClose={onClose}
      />
    );
  }

  if (!hovered && !selected) return null;

  // `targetEq` suppresses the redundant preview of an already-pinned target.
  const compactTarget = hovered !== null && !targetEq(hovered, selected) ? hovered : null;
  const Detail = selected ? detailCardFor(DETAIL_CARD, selected).Detail : null;
  const Compact = compactTarget ? detailCardFor(DETAIL_CARD, compactTarget).Compact : null;

  return (
    <div ref={ref} className={cx(styles.root, 'infoCardStack')}>
      {selected && Detail && (
        <Detail target={selected} isPinned onFocus={onFocusSelected} onClose={onClose} />
      )}
      {compactTarget && Compact && <Compact target={compactTarget} />}
    </div>
  );
}

export default InfoCard;
