/**
 * ExternalLinkIcon — the arrow-out-of-box glyph trailing a source title, so a
 * link that leaves the app reads as one before it is clicked. Inherits
 * currentColor from the accent-tinted title row.
 */

import type { ReactNode } from 'react';

function ExternalLinkIcon(): ReactNode {
  return (
    <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true" focusable="false">
      <path
        d="M3.5 8.5 L8.5 3.5 M4.5 3.5 H8.5 V7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default ExternalLinkIcon;
