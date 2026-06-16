// src/components/HomeButton/HomeIcon.tsx
/**
 * HomeIcon — outlined house glyph. Inline SVG so it inherits
 * currentColor from the button it sits inside; PillButton hover/focus
 * tints it via the cascade, matching the sibling top-bar pill icons.
 */

import type { ReactNode } from 'react';

function HomeIcon(): ReactNode {
  return (
    <svg
      data-testid="home-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 7.5 L8 3 L13.5 7.5 M3.75 6.5 L3.75 12.5 L12.25 12.5 L12.25 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default HomeIcon;
