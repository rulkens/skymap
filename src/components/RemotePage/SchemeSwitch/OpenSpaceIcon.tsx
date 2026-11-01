/** OpenSpaceIcon: ringed planet for the OpenSpace scheme (solar-system origin); inherits currentColor. */

import type { ReactNode } from 'react';

function OpenSpaceIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="5" />
        <path d="M20.2 8.6c1.2 1.4 1.3 2.5.6 3.2-1.6 1.6-6.3.9-10.4-1.6M3.8 15.4c-1.2-1.4-1.3-2.5-.6-3.2 1-1 3.2-1.2 5.6-.6" />
      </g>
    </svg>
  );
}

export default OpenSpaceIcon;
