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

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import { targetEq } from '../../services/engine/helpers/targetEq';
import { useIsMobile } from '../../hooks/useIsMobile';
import { APP_COMPOSITION } from '../../compositions/app';
import { detailCardTable } from './detailCardTable';
import { detailCardFor } from '../../utils/infoCard/detailCardFor';
import styles from './InfoCard.module.css';

// Folded at module load so a missing arm throws at boot, not on the first hover.
const DETAIL_CARD = detailCardTable(APP_COMPOSITION.layers);

export type InfoCardProps = {
  /** The target under the cursor, or null on empty sky. */
  hovered: FocusableTarget | null;
  /** The pinned target, or null. Owns the detail slot; a different hovered target previews beneath. */
  selected: FocusableTarget | null;
  /** The pinned card's "Focus" pill. */
  onFocus?: (target: FocusableTarget) => void;
  /** The pinned card's Close (×); same as Esc. */
  onClose?: () => void;
};

function InfoCard({ hovered, selected, onFocus, onClose }: InfoCardProps): ReactNode {
  const isMobile = useIsMobile();

  if (isMobile) {
    if (selected === null) return null;
    const { Detail } = detailCardFor(DETAIL_CARD, selected);
    return <Detail target={selected} isPinned layout="phone" onFocus={onFocus} onClose={onClose} />;
  }

  if (!hovered && !selected) return null;

  // `targetEq` suppresses the redundant preview of an already-pinned target.
  const compactTarget = hovered !== null && !targetEq(hovered, selected) ? hovered : null;
  const Detail = selected ? detailCardFor(DETAIL_CARD, selected).Detail : null;
  const Compact = compactTarget ? detailCardFor(DETAIL_CARD, compactTarget).Compact : null;

  return (
    <div className={cx(styles.root, 'infoCardStack')}>
      {selected && Detail && (
        <Detail target={selected} isPinned onFocus={onFocus} onClose={onClose} />
      )}
      {compactTarget && Compact && <Compact target={compactTarget} />}
    </div>
  );
}

export default InfoCard;
