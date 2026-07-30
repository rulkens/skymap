/**
 * RenderTogglesSection — checkbox list for the DebugPanel that lets a
 * developer disable individual renderer passes at runtime.
 *
 * The intended use case is "I see two overlapping draws on screen and
 * I want to know which renderer is responsible for which".  Toggling
 * a pass calls `onTogglePass(name)` (supplied by
 * `RenderTogglesSectionContainer`), which dispatches `setPassDisabled` to
 * the RTK settings store; the
 * store notifies synchronously and the updated `disabledPasses` record
 * flows back down via the `disabledPasses` prop; `watchWakeSaga` wakes the
 * render-on-demand loop so the change shows up on the next frame even
 * when the camera is idle.
 *
 * This section is PRESENTATIONAL — it imports nothing from `store/` or
 * `state/`.  All dispatch is delegated upward to `RenderTogglesSectionContainer`.
 *
 * ### Override semantics (one-way)
 *
 * The toggle can only HIDE a pass that would otherwise have rendered
 * this frame — it never force-enables a pass whose own `enabled()`
 * gate returned false (e.g. there are no thumbnails on screen, or the
 * settings panel turned filaments off).  This matches the encoder
 * loop: `pass.enabled() && disabledPasses[pass.name] !== true`.
 *
 * ### Where the disabled record lives
 *
 * The record is RTK settings state (`settings.debug.disabledPasses`),
 * read live via the `disabledPasses` prop.  No local mirror: a toggle
 * calls `onTogglePass`, the container dispatches `setPassDisabled`, the
 * store notifies synchronously, and the prop flows the new record back.
 *
 * ### Why a collapsible section
 *
 * Matches `AssetLoadingSection` and `GpuTimingsSection` — the user can
 * collapse the toggle list once they've finished poking at it.  The
 * section defaults to closed because most sessions won't need it; the
 * other two sections default to open because their data is the
 * primary reason someone opened the panel.
 */

import type { ReactElement } from 'react';
import cx from 'classnames';
import { groupPassNames } from '../../services/engine/frame/frameProgram';
import DebugSection from './DebugSection';
import styles from './RenderTogglesSection.module.css';

export type RenderTogglesSectionProps = {
  /** Pass names in draw order, sourced from the engine handle's `passOverrides.allNames`. */
  passNames: readonly string[];
  /** Live disabled-pass record from the settings store (container subscribes). */
  disabledPasses: Record<string, boolean>;
  /** Called with the pass name when a checkbox is toggled. Container dispatches setPassDisabled. */
  onTogglePass: (name: string) => void;
};

export function RenderTogglesSection({
  passNames,
  disabledPasses,
  onTogglePass,
}: RenderTogglesSectionProps): ReactElement {
  // Group the togglable passes by the frame program's (target, slab) step
  // structure — the SAME grouping GpuTimingsSection uses — so the two lists
  // scan positionally. `groupPassNames` reorders `passNames` into the grouped
  // order and drops the non-togglable composite/pick slots (they aren't in
  // the handle's pass list, so their group is simply empty here).
  const groups = groupPassNames(passNames);
  return (
    <DebugSection title="Renderer Toggles">
      {groups.map((group) => (
        <div key={group.title} className={styles.group}>
          <div className={styles.groupTitle}>{group.title}</div>
          {group.rows.map((row) => {
            const isDisabled = disabledPasses[row.name] === true;
            return (
              <label key={row.name} className={cx(styles.row, isDisabled && styles.rowDisabled)}>
                <input
                  type="checkbox"
                  checked={!isDisabled}
                  onChange={() => onTogglePass(row.name)}
                />
                <span>{row.name}</span>
              </label>
            );
          })}
        </div>
      ))}
    </DebugSection>
  );
}
