// src/components/TourOverlay/StopIcon.tsx
/**
 * StopIcon — a real filled square (the media "stop" glyph) for the tour's
 * exit button. Replaces the former hairline ✕, which read as too small and
 * incidental next to the chunky pause ring. Inherits currentColor so the
 * circular stop button's muted/hover tint cascades in.
 */

import type { ReactNode } from 'react';

function StopIcon(): ReactNode {
  return (
    <svg
      data-testid="stop-icon"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export default StopIcon;
