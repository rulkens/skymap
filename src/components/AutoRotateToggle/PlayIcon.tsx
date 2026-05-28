// src/components/AutoRotateToggle/PlayIcon.tsx
/**
 * PlayIcon — solid right-pointing triangle. Inherits currentColor
 * from its parent button so PillButton hover/focus can tint it via
 * the cascade.
 */

import type { ReactNode } from 'react';

function PlayIcon(): ReactNode {
  return (
    <svg
      data-testid="play-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 3 L13 8 L4 13 Z" fill="currentColor" />
    </svg>
  );
}

export default PlayIcon;
