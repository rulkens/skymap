// src/components/TourOverlay/PrevIcon.tsx
/**
 * PrevIcon — left-pointing triangle for the tour nav's "previous beat"
 * button. Inherits currentColor so the button's muted/hover/ghost tint
 * cascades in, matching the sibling top-bar icon glyphs.
 */

import type { ReactNode } from 'react';

function PrevIcon(): ReactNode {
  return (
    <svg
      data-testid="prev-icon"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3 L3 8 L12 13 Z" fill="currentColor" />
    </svg>
  );
}

export default PrevIcon;
