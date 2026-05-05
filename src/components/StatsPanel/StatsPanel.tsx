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
 * ### Collapse affordance
 *
 * The header is a clickable <button> that folds the body away — same chevron
 * + uppercase title pattern as SettingsPanel's outer collapse and
 * NavigationPanel.  State is persisted to `localStorage` under
 * `skymap.stats.open` so a user's choice survives a reload (independent
 * of the analogous keys for the SettingsPanel and NavigationPanel).
 * Default OPEN so a first-time visitor sees the perf telemetry without
 * having to discover it; once they know it's there they can fold it away
 * to reclaim screen real estate.
 *
 * ### Style duplication with SettingsPanel
 *
 * Same rationale as NavigationPanel — the glassmorphic look (background,
 * blur, border, monospace font, 300px width) is duplicated in this module's
 * stylesheet rather than imported from SettingsPanel.module.css.  CSS
 * Modules cross-imports via `composes:` are awkward and error-prone; small
 * duplication wins on clarity.
 */

import { useEffect, useState, type ReactNode } from 'react';
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
 * localStorage key for this panel's open/closed state.
 *
 * The `skymap.` prefix namespaces the key so it doesn't collide with anything
 * else the page (or a future host page) might write.  The middle segment
 * names the panel; the trailing `.open` is a per-feature suffix so the
 * panel could grow other persisted bits (`.position`, `.something-else`)
 * without rewriting existing keys.
 */
const STORAGE_KEY = 'skymap.stats.open';

/**
 * Read the persisted open/closed state.
 *
 * Mirrors `readSectionOpen` in `CollapsibleSection.tsx` but inlined here
 * because the helper is short and there are only two consumers (this panel
 * and NavigationPanel).  See CLAUDE.md guidance — < 30 lines = inline; only
 * factor out when the third consumer arrives.
 *
 * Why each branch:
 *   - `typeof window === 'undefined'`: SSR safety.  We don't server-render
 *     today, but the guard keeps the function usable in an SSR context —
 *     and prevents Vitest's node-env tests from crashing when no shim is
 *     installed.
 *   - try/catch around getItem: Safari private mode (and a few corporate
 *     environments) throw on `localStorage` access.  We swallow the error
 *     and fall back to `defaultOpen` rather than break the UI.
 *   - `v === '1'`: persisted format is the smallest possible — a single
 *     character.  Any unrecognised value falls through to false (closed),
 *     which is the safer default for "I don't know what this means".
 */
function readPanelOpen(defaultOpen: boolean): boolean {
  if (typeof window === 'undefined') return defaultOpen;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === null ? defaultOpen : v === '1';
  } catch {
    return defaultOpen;
  }
}

/**
 * Write the open/closed state.  Swallows errors silently — Safari private
 * mode (and a few corporate environments) throw `QuotaExceededError` from
 * `setItem` even when reading is allowed.  The panel still works; the
 * choice just doesn't survive a reload.
 */
function writePanelOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
  } catch {
    // Intentionally empty — see docblock.
  }
}

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

  // Lazy initializer — read localStorage exactly once at mount, not on
  // every re-render (this panel re-renders on every FPS sample, so the
  // guard matters more here than in NavigationPanel).  Default OPEN so a
  // first-time visitor sees the telemetry without discovering the
  // affordance.
  const [open, setOpen] = useState<boolean>(() => readPanelOpen(true));

  // Persist on every change.  Splitting writes into an effect (rather
  // than calling `writePanelOpen` inline in the click handler) means
  // any external `setOpen` would also persist — robust to future
  // refactors that toggle from elsewhere.
  useEffect(() => {
    writePanelOpen(open);
  }, [open]);

  return (
    <div className={styles.statsPanel} aria-label="Render statistics">
      {/*
        Title doubles as the click target for collapse/expand — same pattern
        as SettingsPanel's outer collapse and NavigationPanel.  Using a real
        <button> rather than a styled <div> gives us keyboard focus +
        Enter/Space activation + `aria-expanded` for screen readers without
        a custom onKeyDown.  The CSS strips default <button> chrome so the
        row reads as a plain heading; only the cursor + focus ring announce
        its interactivity.
      */}
      <button
        type="button"
        className={styles.panelTitleButton}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="stats-panel-body"
      >
        {/*
          Chevron sits LEFT of the heading like a tree-twirl / list-marker.
          Two glyphs (▸ closed, ▾ open) instead of a CSS rotation because
          the parent panel doesn't yet have rotation animation — keeping
          the markup minimal and matching SettingsPanel's outer collapse.
        */}
        <span className={styles.panelTitleChevron} aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className={styles.panelTitle}>STATS</span>
      </button>

      {/*
        Body — conditionally rendered rather than CSS-hidden, matching
        SettingsPanel's outer collapse.  The row count grows with loaded
        surveys (up to ~5 rows), so removing the body when collapsed
        avoids paying for the off-screen DOM tree.  The `id` lets
        `aria-controls` on the title button point at a real element.
      */}
      {open && (
        <div id="stats-panel-body" className={styles.panelContent}>
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
      )}
    </div>
  );
}
