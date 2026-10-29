/** OrbitIcon: stroke glyph for the orbit axis button; inherits currentColor. */

import type { ReactNode } from 'react';

function OrbitIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 12a7 7 0 1 1-2.1-5M19 4v3.5h-3.5" />
        <circle cx="12" cy="12" r="1.5" />
      </g>
    </svg>
  );
}

export default OrbitIcon;
