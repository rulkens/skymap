/**
 * FullscreenIcon — four corner brackets, pointing outward to enter full screen
 * and inward to leave it, so the state never rests on colour alone. Inherits
 * currentColor from its PillButton.
 */

import type { ReactNode } from 'react';

const ENTER = 'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4';
const EXIT = 'M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4';

export type FullscreenIconProps = {
  readonly active: boolean;
};

function FullscreenIcon({ active }: FullscreenIconProps): ReactNode {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d={active ? EXIT : ENTER}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default FullscreenIcon;
