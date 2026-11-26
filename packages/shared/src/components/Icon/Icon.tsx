/**
 * Icon — the one frame every icon draws in: a 24-unit grid, a round stroke in
 * `currentColor`, hidden from assistive tech (the button carries the name). An icon
 * component passes only its inner paths.
 *
 * The stroke keeps one on-screen weight at every size, the phone remote's 1.75 units
 * at 20 px (1.46 px), so a 13 px tour glyph and a 24 px dock glyph read as one set.
 * A filled part goes in `<g fill="currentColor" stroke="none">`: over a fill, a stroke
 * paints a translucent colour twice and leaves a bright rim.
 */

import type { ReactNode } from 'react';

export type IconProps = {
  /** Rendered width and height in CSS px. */
  readonly size: number;
  readonly children: ReactNode;
};

function Icon({ size, children }: IconProps): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={(1.75 * 20) / size}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

export default Icon;
