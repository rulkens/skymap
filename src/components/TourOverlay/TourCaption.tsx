// src/components/TourOverlay/TourCaption.tsx
/**
 * TourCaption — the per-beat caption column, in the splash's typographic
 * register (mono kicker + Cormorant-Garamond title + mono markdown body).
 *
 * Purely presentational: it takes the resolved caption + the beat readout
 * and draws them. Placement is derived, not authored twice — `captionAnchor`
 * splits the single `position` literal into its vertical/horizontal halves,
 * and the horizontal half drives BOTH the anchor class and the text
 * alignment. A right-anchored caption right-aligns for free; there is no
 * separate alignment prop to keep in sync.
 *
 * The body is rendered through react-markdown so authors can drop a **bold**
 * word or a link into placard prose. Links are forced to a new tab — a click
 * inside the tour must never navigate the page out from under the tour.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import ReactMarkdown from 'react-markdown';
import type { BeatCaption } from '../../@types/animation/tour/BeatCaption';
import { captionAnchor } from '../../utils/animation/captionAnchor';
import styles from './TourOverlay.module.css';

export type TourCaptionProps = {
  readonly caption: BeatCaption;
  readonly label: string | null;
  readonly index: number;
  readonly total: number;
};

// Maps the anchor halves to the matching CSS-module classes. The vertical
// half picks top/bottom; the horizontal half picks left/center/right (which
// also fixes the text alignment, since the classes set `text-align`).
const VERTICAL_CLASS = {
  top: styles.captionTop,
  bottom: styles.captionBottom,
} as const;

const HORIZONTAL_CLASS = {
  left: styles.captionLeft,
  center: styles.captionCenter,
  right: styles.captionRight,
} as const;

function TourCaption({ caption, label, index, total }: TourCaptionProps): ReactNode {
  const { vertical, horizontal } = captionAnchor(caption.position ?? 'bottom-left');

  // Zero-padded "01 / 03" readout. The kicker prefixes the tour's label
  // (e.g. "Named Cosmic Web · 01 / 03") unless the tour has no label.
  const current = String(index + 1).padStart(2, '0');
  const grand = String(total).padStart(2, '0');
  const readout = `${current} / ${grand}`;

  return (
    <div className={cx(styles.caption, VERTICAL_CLASS[vertical], HORIZONTAL_CLASS[horizontal])}>
      <div className={styles.label}>{label ? `${label} · ${readout}` : readout}</div>
      <h1 className={styles.title}>{caption.title}</h1>
      {caption.body ? (
        <div className={styles.body}>
          <ReactMarkdown
            components={{
              a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
            }}
          >
            {caption.body}
          </ReactMarkdown>
        </div>
      ) : null}
    </div>
  );
}

export default TourCaption;
