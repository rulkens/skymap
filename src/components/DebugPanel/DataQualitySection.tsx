/**
 * DataQualitySection — checkbox list for the DebugPanel that surfaces
 * data-quality / catalog-audit toggles to developers.
 *
 * The initial residents are the two orientation-fallback diagnostics
 * (Task #4 of the 2026-05-19 SettingsPanel UX audit, Q16g):
 *
 *   - "Highlight fallback" tints galaxies without measured b/a +
 *     position-angle magenta in the fragment shader, so the user can
 *     scan which galaxy catalogs have real photometric orientation coverage.
 *   - "Show only real" goes further and discards fallback-orientation
 *     fragments entirely, leaving only galaxies with measured b/a + PA.
 *
 * ### Why a separate section, not RenderTogglesSection
 *
 * RenderTogglesSection's vocabulary is per-pass renderer on/off (points,
 * filaments, thumbnails, volume passes, etc.).  These toggles are a
 * *different* kind of switch — they don't disable a draw, they reveal
 * how trustworthy the underlying per-galaxy data is.  Mixing them into
 * the renderer-toggle list would muddy that distinction; the audit
 * explicitly called out "the render toggles is specifically for render
 * layers" as the reason for a fresh section.  Future data-quality
 * diagnostics (e.g. "highlight cross-match conflicts", "tint by
 * redshift uncertainty") land here too.
 *
 * ### Why a separate `<details>` block
 *
 * Matches `AssetLoadingSection` / `GpuTimingsSection` /
 * `RenderTogglesSection` — the user can collapse the toggle list once
 * they've finished poking at it.  The section defaults to closed
 * because most sessions never need to flip a data-quality flag (same
 * reasoning the DebugPanel docblock gives for RenderTogglesSection).
 *
 * ### Why props, not an imperative handle
 *
 * The orientation flags live in the RTK settings slice — App.tsx reads
 * them via `useAppSelector` selectors and passes them down as plain
 * props.  Receiving them as props keeps this section a pure function
 * of its inputs and lets the parent DebugPanel decide the wiring.
 * `RenderTogglesSection` dispatches writes the same way.
 */

import type { ReactElement } from 'react';

export type DataQualitySectionProps = {
  highlightFallback: boolean;
  realOnlyMode: boolean;
  onHighlightFallbackChange: (enabled: boolean) => void;
  onRealOnlyModeChange: (enabled: boolean) => void;
};

export function DataQualitySection({
  highlightFallback,
  realOnlyMode,
  onHighlightFallbackChange,
  onRealOnlyModeChange,
}: DataQualitySectionProps): ReactElement {
  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Data Quality</summary>
      <div style={{ marginTop: 4 }}>
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
            checked={highlightFallback}
            onChange={(e) => onHighlightFallbackChange(e.target.checked)}
          />
          <span>Highlight fallback</span>
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
            checked={realOnlyMode}
            onChange={(e) => onRealOnlyModeChange(e.target.checked)}
          />
          <span>Show only real</span>
        </label>
      </div>
    </details>
  );
}
