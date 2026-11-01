/** ZoomIcon: stroke glyph for the zoom axis button; inherits currentColor. */

import type { ReactNode } from 'react';

function ZoomIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
      </g>
    </svg>
  );
}

export default ZoomIcon;
