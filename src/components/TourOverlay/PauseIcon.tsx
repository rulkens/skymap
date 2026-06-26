// src/components/TourOverlay/PauseIcon.tsx
/**
 * PauseIcon — two rounded vertical bars shown inside the dwell ring while the
 * tour is auto-advancing (clicking it pauses). Distinct testid from the
 * AutoRotateToggle pause glyph so the two never collide in a shared render.
 * Inherits currentColor from the pause button.
 */

import type { ReactNode } from 'react';

function PauseIcon(): ReactNode {
  return (
    <svg
      data-testid="tour-pause-icon"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4.5" y="2.5" width="2.6" height="11" rx="1" fill="currentColor" />
      <rect x="8.9" y="2.5" width="2.6" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

export default PauseIcon;
