/**
 * StatsPanel — bottom-left HUD for FPS and rendered point/line counts.
 *
 * ### Why this panel exists
 *
 * The StatusBar used to show running FPS and the live total point count
 * alongside its "WebGPU OK" string, mixing engine-lifecycle text with perf
 * telemetry on a single line.  Splitting the perf telemetry into its own
 * panel lets us:
 *
 *   - Show a single rolled-up "Galaxies · N" total across the surveys
 *     currently TOGGLED ON (`visibleSourceMask`).  The earlier draft listed
 *     one row per loaded survey, but the user's mental model is "how many
 *     points am I looking at right now?" — a single number that responds
 *     to the survey toggles maps that question more directly than four
 *     rows the eye has to sum manually.
 *   - Show filament strip/vertex counts when the optional cosmic-web file
 *     loads.
 *   - Keep the StatusBar focused on engine state.
 *
 * ### Why these props (and not an EngineHandle)
 *
 * StatsPanel is purely presentational — no callbacks, no engine access.
 * Every prop is already tracked in App.tsx state for other reasons; passing
 * them as plain values keeps the component testable with
 * `renderToStaticMarkup` and decouples it from the engine's lifetime.
 *
 * ### Why an em-dash for fps=0
 *
 * The engine's rolling-window FPS estimator needs ≥ 2 frames before it can
 * report a value.  During the sub-100 ms window between mount and the first
 * `onFpsChange` event, we render `—` (em-dash) instead of `0` so the panel
 * doesn't briefly flash a misleading "0 fps" reading.  The engine never
 * reports 0 in practice, so this branch is purely about that startup window.
 *
 * ### Chrome and collapse via Panel
 *
 * The glassmorphic card + clickable uppercase title row + body reveal
 * affordance live in the shared `Panel` component (see
 * `components/common/Panel`).  Collapse state is session-only and lives
 * inside Panel; this module just supplies the FPS/galaxy/filament rows.
 */

import { memo, type ReactNode } from 'react';
import { SURVEY_SOURCES, Source } from '../../data/sources';
import { maskHas } from '../../utils/sourceMask';
import { Panel } from '../common/Panel/Panel';
import styles from './StatsPanel.module.css';
import type { SourceType } from '../../@types/data/Source';

/** Props for StatsPanel.  See module header for design rationale. */
export type StatsPanelProps = {
  /**
   * Rolling-window FPS estimate (integer Hz), driven by the engine's
   * `onFpsChange` callback.  `0` is interpreted as "not yet reported"
   * and rendered as an em-dash; the engine never emits 0 in practice
   * (its window requires ≥ 2 samples).
   */
  fps: number;
  /**
   * Per-survey loaded point counts, indexed by `Source` enum value.
   * Populated as each `.bin` finishes uploading.  Used here only as the
   * input to the rolled-up "Galaxies" total — entries for sources whose
   * visibility bit is OFF in `visibleSourceMask` are excluded from the
   * sum, so the displayed number reflects what's currently rendered
   * rather than what's loaded.
   */
  sourceCounts: Partial<Record<SourceType, number>>;
  /**
   * Bitmask of currently-visible sources.  Bits are tested with
   * `maskHas(mask, source)` from `data/sources.ts`.  A survey that's
   * loaded but toggled off contributes 0 to the displayed count.  We
   * deliberately do NOT show "X loaded, Y visible" — the panel is meant
   * to read as a glanceable telemetry strip, and the SettingsPanel
   * checkboxes already surface the loaded/visible distinction.
   */
  visibleSourceMask: number;
  /**
   * Mirrors the SettingsPanel filaments toggle.  When `false`, the
   * filament row is hidden even if `filamentCounts` is non-null —
   * the panel reflects "what's currently rendered", not "what's loaded".
   */
  filamentsEnabled: boolean;
  /**
   * Strip and vertex counts from the cosmic-web `filaments.bin`, or `null`
   * if the file hasn't loaded yet (or doesn't exist on disk).  The row
   * only renders when both `filamentsEnabled` is true AND this prop is
   * non-null.
   */
  filamentCounts: { stripCount: number; vertexCount: number } | null;
  /**
   * Forwarded to the shared `Panel` chrome.  App.tsx passes `false` on
   * mobile viewports so the FPS / counts panel doesn't eat half the
   * screen on first paint; desktop keeps the previous always-open
   * default.
   */
  defaultOpen?: boolean;
};

function StatsPanel({
  fps,
  sourceCounts,
  visibleSourceMask,
  filamentsEnabled,
  filamentCounts,
  defaultOpen,
}: StatsPanelProps): ReactNode {
  // The em-dash placeholder is centralised here so the logic is obvious
  // in one place rather than scattered through the JSX.
  const fpsText = fps > 0 ? String(fps) : '—';

  // Sum only the visible, real surveys — Synthetic is excluded because its
  // count would only appear in the rare all-fetch-failed fallback, where
  // labelling its synthetic-cloud points as "Galaxies" would be misleading
  // (the StatusBar already tags that condition).  SURVEY_SOURCES gives us a
  // stable enumeration order; the order doesn't matter for a sum but it
  // keeps this loop trivially predictable.
  const galaxyTotal = SURVEY_SOURCES.filter((s) => s !== Source.Synthetic).reduce((sum, source) => {
    if (!maskHas(visibleSourceMask, source)) return sum;
    return sum + (sourceCounts[source] ?? 0);
  }, 0);

  return (
    <Panel title="STATS" ariaLabel="Render statistics" defaultOpen={defaultOpen}>
      <div className={styles.row}>
        <span className={styles.label}>FPS</span>
        <span className={styles.value}>{fpsText}</span>
      </div>

      {/*
        Rolled-up galaxy total.  Sums the loaded counts for sources whose
        visibility bit is ON, so the number tracks the user's survey
        toggles in real time.  Renders unconditionally even when the total
        is zero (e.g. all surveys toggled off) so the panel doesn't
        visually shrink mid-session.
      */}
      <div className={styles.row}>
        <span className={styles.label}>Galaxies</span>
        <span className={styles.value}>{galaxyTotal.toLocaleString()}</span>
      </div>

      {/*
        Filament row — gated on BOTH the user-facing toggle AND the
        presence of loaded counts.  Either being false hides the row.
        See the module header for the "what's rendered" vs "what's
        loaded" distinction.
      */}
      {filamentsEnabled && filamentCounts !== null && (
        <div className={styles.row}>
          <span className={styles.label}>Filaments</span>
          <span className={styles.value}>
            {filamentCounts.stripCount.toLocaleString()} strips,{' '}
            {filamentCounts.vertexCount.toLocaleString()} verts
          </span>
        </div>
      )}
    </Panel>
  );
}

// `React.memo` because App.tsx re-renders on every camera/fps update
// during animation, but our props only legitimately change at engine
// events (`fps` integer flip, survey load, filaments toggle).  Shallow
// compare on six props skips renders that would otherwise re-do the
// `galaxyTotal` reduce and the row JSX for no visible change.
export default memo(StatsPanel);
