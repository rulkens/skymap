/** HomeIcon: house glyph for the Home button; inherits currentColor. */

import type { ReactNode } from 'react';

function HomeIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 11.5 12 4l8 7.5M6 10v9.5h12V10M10 19.5v-5h4v5" />
      </g>
    </svg>
  );
}

export default HomeIcon;
