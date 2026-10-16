/*
 * FeedbackPins — the notes' marks on the page. They live in the page, not the fixed overlay, so they scroll with
 * the content they mark: a layer at the page's origin, which is why it is placed in the document element.
 */
import { createPortal } from 'react-dom';

import type { FeedbackPin } from '../@types/FeedbackPin';
import { boxStyle } from '../boxStyle';
import FeedbackBadge from '../FeedbackBadge/FeedbackBadge.tsx';
import styles from './FeedbackPins.module.css';

type FeedbackPinsProps = { pins: FeedbackPin[] };

function FeedbackPins({ pins }: FeedbackPinsProps) {
  return createPortal(
    <div className={styles.root} data-overlay-ui="">
      {pins.map((pin) => (
        <div key={pin.id} className={styles.pin} style={boxStyle(pin.rect)}>
          <FeedbackBadge className={styles.dot} n={pin.n} title={pin.text} />
        </div>
      ))}
    </div>,
    document.documentElement,
  );
}

export default FeedbackPins;
