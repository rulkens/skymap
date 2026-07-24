/**
 * GalaxyProvenanceSection — checkbox list for the DebugPanel that surfaces
 * a galaxy's data provenance: whether its orientation (b/a + position angle)
 * and its diameter come from real measurement or a catalog fallback estimate.
 *
 *   - "Estimated orientation" replaces estimated-orientation galaxies'
 *     ramp colour with magenta in the vertex shader (not a tint — a red
 *     galaxy multiplied by a tint just darkens), so the user can scan
 *     which catalogs have real photometric orientation coverage.
 *   - "Only measured orientation" goes further and discards
 *     estimated-orientation fragments entirely, leaving only galaxies with
 *     measured b/a + PA.
 *   - "Estimated size" replaces estimated-diameter galaxies' colour with
 *     green, the size-provenance analogue of the first toggle. Galaxies
 *     flagged by both axes render amber. It has no "only measured"
 *     counterpart by design: size estimates are used to *place* a
 *     galaxy's rendered footprint, not to gate whether it draws at all,
 *     so there's no equivalent cull to offer.
 *
 * ### Why a separate section, not RenderTogglesSection
 *
 * RenderTogglesSection's vocabulary is per-pass renderer on/off (points,
 * filaments, thumbnails, volume passes, etc.).  These toggles are a
 * *different* kind of switch — they don't disable a draw, they reveal
 * how trustworthy the underlying per-galaxy data is.  Mixing them into
 * the renderer-toggle list would muddy that distinction; the audit
 * explicitly called out "the render toggles is specifically for render
 * layers" as the reason for a fresh section.  Future provenance
 * diagnostics (e.g. "highlight cross-match conflicts", "tint by
 * redshift uncertainty") land here too.
 *
 * ### Why props, not an imperative handle
 *
 * The provenance flags live in the RTK settings slice — App.tsx reads
 * them via `useAppSelector` selectors and passes them down as plain
 * props.  Receiving them as props keeps this section a pure function
 * of its inputs and lets the parent DebugPanel decide the wiring.
 * `RenderTogglesSection` dispatches writes the same way.
 */

import DebugSection from './DebugSection';

export type GalaxyProvenanceSectionProps = {
  highlightEstimatedOrientation: boolean;
  onlyMeasuredOrientation: boolean;
  onHighlightEstimatedOrientationChange: (enabled: boolean) => void;
  onOnlyMeasuredOrientationChange: (enabled: boolean) => void;
  highlightEstimatedSize: boolean;
  onHighlightEstimatedSizeChange: (enabled: boolean) => void;
};

export function GalaxyProvenanceSection({
  highlightEstimatedOrientation,
  onlyMeasuredOrientation,
  onHighlightEstimatedOrientationChange,
  onOnlyMeasuredOrientationChange,
  highlightEstimatedSize,
  onHighlightEstimatedSizeChange,
}: GalaxyProvenanceSectionProps) {
  return (
    <DebugSection title="Galaxy Provenance">
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
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: '#ff1ae6',
            flexShrink: 0,
          }}
        />
        <span>Estimated orientation</span>
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
          checked={highlightEstimatedSize}
          onChange={(e) => onHighlightEstimatedSizeChange(e.target.checked)}
        />
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: '#26ff40',
            flexShrink: 0,
          }}
        />
        <span>Estimated size</span>
      </label>
    </DebugSection>
  );
}
