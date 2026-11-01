/** RollIcon: stroke glyph for the roll axis button; inherits currentColor. */

import type { ReactNode } from 'react';

function RollIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14" />
        <path d="M20 8.5A8.5 8.5 0 0 0 5.5 6M4 15.5A8.5 8.5 0 0 0 18.5 18" />
        <path d="M5.5 2.5V6H9M18.5 21.5V18H15" />
      </g>
    </svg>
  );
}

export default RollIcon;
