// src/components/Splash/InfoIcon.tsx
/**
 * InfoIcon — circled-? glyph. Inline SVG so it inherits currentColor
 * from the button it sits inside; no separate CSS module since the
 * caller owns sizing via className.
 */

import type { ReactNode } from 'react';

export type InfoIconProps = {
  readonly className?: string;
};

function InfoIcon({ className }: InfoIconProps): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 6 Q6.5 4.5 8 4.5 Q9.5 4.5 9.5 6 Q9.5 7 8 7.5 L8 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="11.25" r="0.85" fill="currentColor" />
    </svg>
  );
}

export default InfoIcon;
