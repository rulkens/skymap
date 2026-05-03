/**
 * HomeButton — a small glass button that pivots the camera back to its
 * initial framing (target=origin, default distance/yaw/pitch).
 *
 * Positioned bottom-left next to the SettingsPanel, so the two "world
 * controls" sit side-by-side without overlapping the InfoCard (top-right)
 * or the StatusBar (top-left).
 *
 * The button is purely presentational — it just fires `props.onClick`.
 * App.tsx wires the click to `handleRef.current?.focusOnHome()`.
 *
 * ### Why an inline SVG icon?
 *
 * Inline SVG keeps the asset in the bundle (no extra HTTP request), inherits
 * `currentColor` for theming, and scales crisply at any DPI.  The shape is
 * the standard "house" glyph — instantly recognisable at 18×18 px.
 */

import type { ReactNode } from 'react';
import styles from './HomeButton.module.css';

type Props = {
  /** Fired when the user clicks the home glyph. */
  onClick: () => void;
};

export function HomeButton({ onClick }: Props): ReactNode {
  return (
    <button
      type="button"
      className={styles.homeButton}
      onClick={onClick}
      aria-label="Return camera to home view"
      title="Return to home (h)"
    >
      {/*
        Standard house glyph.  Stroke-only so it inherits currentColor and
        renders well on the dark glass background.  viewBox 0 0 24 24 is the
        de-facto icon-grid size; width/height come from the CSS class so the
        SVG is independent of the base font size.
      */}
      <svg
        className={styles.homeIcon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Roof + walls */}
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10.5V20h14V10.5" />
        {/* Door */}
        <path d="M10 20v-5h4v5" />
      </svg>
    </button>
  );
}
