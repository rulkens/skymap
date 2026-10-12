/**
 * EyeOffIcon — EyeIcon struck through, shown while the exhibit UI is hidden.
 */

import type { ReactNode } from 'react';

function EyeOffIcon(): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M1 8c1.8-3 4-4.5 7-4.5S13.2 5 15 8c-1.8 3-4 4.5-7 4.5S2.8 11 1 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default EyeOffIcon;
