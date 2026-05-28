// src/components/AutoRotateToggle/PauseIcon.tsx
/**
 * PauseIcon — two rounded vertical bars. Inherits currentColor from
 * its parent button.
 */

import type { ReactNode } from 'react';

function PauseIcon(): ReactNode {
  return (
    <svg
      data-testid="pause-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="3" width="2.5" height="10" rx="1" fill="currentColor" />
      <rect x="9.5" y="3" width="2.5" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}

export default PauseIcon;
