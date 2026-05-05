/**
 * StatsPanel — bottom-left HUD for FPS and rendered point/line counts.
 *
 * ### Why this panel exists
 *
 * Skymap's StatusBar used to show the running FPS and the live total point
 * count alongside the engine's "WebGPU OK" string.  That made the status
 * bar do two unrelated jobs (state machine readout + perf telemetry) and
 * forced the user to parse a long single line.  Splitting the perf
 * telemetry into its own panel lets us:
 *
 *   - Show one row per loaded survey (SDSS · 220,453, GLADE · 2,400,000)
 *     instead of summing them into a single number — useful when the user
 *     toggles surveys and wants to see what each contributes.
 *   - Show filament counts the same way once the optional cosmic-web file
 *     loads (`Filaments · 3,845 strips, 27,410 verts`).
 *   - Keep the StatusBar focused on engine lifecycle (initializing /
 *     loading / error / ready).
 *
 * The alternative we considered was a settings-panel section.  That hides
 * the numbers behind a click and conflates "controls" (which the user
 * mutates) with "telemetry" (which the engine pushes).  A dedicated panel
 * makes the read-only nature obvious.
 *
 * ### Why these props (and not an EngineHandle)
 *
 * StatsPanel is a pure presentational component — no callbacks, no engine
 * access.  All four props are values that App.tsx already tracks in React
 * state for other reasons (FPS for old StatusBar wiring; sourceCounts for
 * SettingsPanel labels; filaments toggle / counts for the new wiring added
 * in the same UI restructure).  Passing them as plain props keeps the
 * component testable with `renderToStaticMarkup` and decouples it from the
 * engine's lifetime.
 *
 * ### Why an em-dash for fps=0
 *
 * The engine's rolling-window FPS estimator needs ≥ 2 frames before it can
 * report a value.  During the sub-100 ms window between mount and the first
 * `onFpsChange` event, we render `—` (em-dash) instead of `0` so the panel
 * doesn't briefly flash a misleading "0 fps" reading.  The engine never
 * reports 0 in practice, so this branch is purely about that startup window.
 *
 * ### Style duplication with SettingsPanel
 *
 * Same rationale as NavigationPanel — the glassmorphic look (background,
 * blur, border, monospace font, 300px width) is duplicated in this module's
 * stylesheet rather than imported from SettingsPanel.module.css.  CSS
 * Modules cross-imports via `composes:` are awkward and error-prone; small
 * duplication wins on clarity.
 */

import type { ReactNode } from 'react';
import { ALL_SOURCES, Source, sourceLabel } from '../../data/sources';
import styles from './StatsPanel.module.css';

/** Props for StatsPanel.  See module header for design rationale. */
export type StatsPanelProps = {
  /**
   * Rolling-window FPS estimate (integer Hz), driven by the engine's
   * `onFpsChange` callback.  A value of `0` is interpreted as "not yet
   * reported" and rendered as an em-dash; the engine never emits 0 in
   * practice (its window requires ≥ 2 samples).
   */
  fps: number;
  /**
   * Per-survey loaded point counts, indexed by `Source` enum value.
   * Populated as each `.bin` finishes uploading via `onCloudReady`.  Only
   * sources whose entries are defined here render a row — surveys still
   * loading are silently absent rather than showing a "0" placeholder.
   */
  sourceCounts: Partial<Record<Source, number>>;
  /**
   * Mirrors the SettingsPanel filaments toggle.  When `false`, the
   * filament row is hidden even if `filamentCounts` is non-null — the
   * panel reflects "what's currently rendered", not "what's loaded".
   */
  filamentsEnabled: boolean;
  /**
   * Strip and vertex counts from the cosmic-web `filaments.bin`, or
   * `null` if the file hasn't loaded yet (or doesn't exist on disk).
   * The row is only rendered when both `filamentsEnabled` is true AND
   * this prop is non-null.
   */
  filamentCounts: { stripCount: number; vertexCount: number } | null;
};

/**
 * Renders the stats panel.
 *
 * @example
 * // In App.tsx, inside the leftStack wrapper:
 * <StatsPanel
 *   fps={fps}
 *   sourceCounts={sourceCounts}
 *   filamentsEnabled={filamentsEnabled}
 *   filamentCounts={filamentCounts}
 * />
 */
export function StatsPanel({
  fps,
  sourceCounts,
  filamentsEnabled,
  filamentCounts,
}: StatsPanelProps): ReactNode {
  // Render-time helper: the em-dash placeholder is centralised here so the
  // logic is obvious in one place rather than scattered through the JSX.
  const fpsText = fps > 0 ? String(fps) : '—';

  return (
    <div className={styles.statsPanel}>
      <div className={styles.panelTitle}>STATS</div>
      <div className={styles.panelContent}>
        <div className={styles.row}>
          <span className={styles.label}>FPS</span>
          <span className={styles.value}>{fpsText}</span>
        </div>

        {/*
          Per-survey rows.  We iterate ALL_SOURCES (rather than
          Object.keys(sourceCounts)) so the rendering order is stable —
          relying on object-key order would mean rows shuffle as different
          .bin files land at different times.  ALL_SOURCES is hard-ordered
          in src/data/sources.ts.

          We skip Source.Synthetic explicitly because its row would only
          appear in the (rare) all-fetch-failed fallback, where surfacing
          a "Synthetic · N" row would be more confusing than helpful — the
          StatusBar already flags the synthetic-fallback condition.
        */}
        {ALL_SOURCES.filter((s) => s !== Source.Synthetic).map((source) => {
          const count = sourceCounts[source];
          if (count === undefined) return null;
          return (
            <div className={styles.row} key={source}>
              <span className={styles.label}>{sourceLabel(source)}</span>
              <span className={styles.value}>{count.toLocaleString()}</span>
            </div>
          );
        })}

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
      </div>
    </div>
  );
}
