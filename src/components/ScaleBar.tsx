/**
 * ScaleBar — bottom-right distance legend for the current zoom level.
 *
 * This is a pure presentational component. It receives a `ScaleInfo` value —
 * a pre-formatted label and a pixel width — and renders the bar with a single
 * inline style. All the math (niceRound, formatDistance, pixel-per-Mpc
 * conversion) lives in the engine; this component just displays the result.
 *
 * ### How the bar is rendered
 *
 * The bar uses CSS `border-bottom`, `border-left`, and `border-right` to form
 * a bracket shape (⌐ ¬) without any extra elements. The width is set as an
 * inline style because it changes every frame on zoom. The label is a block
 * above the bar so they stack naturally.
 *
 * ### CSS dependency
 *
 * Uses `id="scale-bar"`, `id="scale-label"`, and `id="scale-line"` as declared
 * in `index.html`. The outer div's position (fixed, bottom-right) and the bar's
 * border styling all come from the existing stylesheet.
 */

import type { ReactNode } from 'react';
import type { ScaleInfo } from '../engine';

/** Props for ScaleBar. */
type ScaleBarProps = {
  /** Current scale info from the engine. */
  scale: ScaleInfo;
};

/**
 * Renders the distance scale bar.
 *
 * @example
 * // In App.tsx (assuming scale state is maintained there):
 * <ScaleBar scale={scale} />
 */
export function ScaleBar({ scale }: ScaleBarProps): ReactNode {
  return (
    <div id="scale-bar" aria-label="Scale reference">
      {/* Label: pre-formatted string like "500 Mpc" or "2 Gpc" */}
      <span id="scale-label">{scale.label}</span>

      {/*
        Bar line: width is set inline because it changes dynamically.
        `scale.widthPx` is already rounded to an integer by the engine,
        so `+ 'px'` is safe. We use a string to match the CSS `px` unit.

        The bracket appearance comes from the CSS borders on #scale-line.
      */}
      <span
        id="scale-line"
        style={{ width: scale.widthPx + 'px' }}
      />
    </div>
  );
}
