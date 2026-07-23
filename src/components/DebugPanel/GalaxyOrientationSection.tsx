/**
 * GalaxyOrientationSection — checkbox list for the DebugPanel that surfaces
 * a galaxy's orientation provenance: whether its b/a + position-angle come
 * from real photometric measurement or a catalog fallback estimate.
 *
 *   - "Highlight estimated orientation" tints estimated-orientation
 *     galaxies magenta in the fragment shader, so the user can scan which
 *     catalogs have real photometric orientation coverage.
 *   - "Only measured orientation" goes further and discards
 *     estimated-orientation fragments entirely, leaving only galaxies with
 *     measured b/a + PA.
 *
 * ### Why a separate section, not RenderTogglesSection
 *
 * RenderTogglesSection's vocabulary is per-pass renderer on/off (points,
 * filaments, thumbnails, volume passes, etc.).  These toggles are a
 * *different* kind of switch — they don't disable a draw, they reveal
 * how trustworthy the underlying per-galaxy data is.  Mixing them into
 * the renderer-toggle list would muddy that distinction; the audit
 * explicitly called out "the render toggles is specifically for render
 * layers" as the reason for a fresh section.  Future orientation/data-quality
 * diagnostics (e.g. "highlight cross-match conflicts", "tint by
 * redshift uncertainty") land here too.
 *
 * ### Why props, not an imperative handle
 *
 * The orientation flags live in the RTK settings slice — App.tsx reads
 * them via `useAppSelector` selectors and passes them down as plain
 * props.  Receiving them as props keeps this section a pure function
 * of its inputs and lets the parent DebugPanel decide the wiring.
 * `RenderTogglesSection` dispatches writes the same way.
 */

import DebugSection from './DebugSection';

export type GalaxyOrientationSectionProps = {
  highlightEstimatedOrientation: boolean;
  onlyMeasuredOrientation: boolean;
  onHighlightEstimatedOrientationChange: (enabled: boolean) => void;
  onOnlyMeasuredOrientationChange: (enabled: boolean) => void;
};

export function GalaxyOrientationSection({
  highlightEstimatedOrientation,
  onlyMeasuredOrientation,
  onHighlightEstimatedOrientationChange,
  onOnlyMeasuredOrientationChange,
}: GalaxyOrientationSectionProps) {
  return (
    <DebugSection title="Galaxy Orientation">
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={highlightEstimatedOrientation}
          onChange={(e) => onHighlightEstimatedOrientationChange(e.target.checked)}
        />
        <span>Highlight estimated orientation</span>
      </label>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={onlyMeasuredOrientation}
          onChange={(e) => onOnlyMeasuredOrientationChange(e.target.checked)}
        />
        <span>Only measured orientation</span>
      </label>
    </DebugSection>
  );
}
