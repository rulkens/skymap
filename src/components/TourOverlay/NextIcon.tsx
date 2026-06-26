// src/components/TourOverlay/NextIcon.tsx
/**
 * NextIcon — right-pointing triangle for the tour nav's "next beat" button.
 * Inherits currentColor from its parent button, mirroring PrevIcon.
 */

import type { ReactNode } from 'react';

function NextIcon(): ReactNode {
  return (
    <svg
      data-testid="next-icon"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 3 L13 8 L4 13 Z" fill="currentColor" />
    </svg>
  );
}

export default NextIcon;
