// src/components/TourOverlay/PlayIcon.tsx
/**
 * PlayIcon — solid right-pointing triangle shown inside the dwell ring while
 * the tour is paused (clicking it resumes). The path is nudged right of the
 * geometric centre so the triangle reads as optically centred in the ring.
 * Inherits currentColor from the pause button.
 */

import type { ReactNode } from 'react';

function PlayIcon(): ReactNode {
  return (
    <svg
      data-testid="tour-play-icon"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5.5 3 L13 8 L5.5 13 Z" fill="currentColor" />
    </svg>
  );
}

export default PlayIcon;
