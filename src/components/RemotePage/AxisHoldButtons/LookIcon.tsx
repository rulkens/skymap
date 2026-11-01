/** LookIcon: stroke glyph for the look axis button; inherits currentColor. */

import type { ReactNode } from 'react';

function LookIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.75" />
      </g>
    </svg>
  );
}

export default LookIcon;
