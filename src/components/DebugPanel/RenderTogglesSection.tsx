/**
 * RenderTogglesSection — checkbox list for the DebugPanel that lets a
 * developer disable individual renderer passes at runtime.
 *
 * The intended use case is "I see two overlapping draws on screen and
 * I want to know which renderer is responsible for which".  Toggling
 * a pass calls `onTogglePass(name)` (supplied by `DebugPanelContainer`),
 * which dispatches `setPassDisabled` to the RTK settings store; the
 * store notifies synchronously and the updated `disabledPasses` record
 * flows back down via the `disabledPasses` prop; `watchWakeSaga` wakes the
 * render-on-demand loop so the change shows up on the next frame even
 * when the camera is idle.
 *
 * This section is PRESENTATIONAL — it imports nothing from `store/` or
 * `state/`.  All dispatch is delegated upward to `DebugPanelContainer`.
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
 * ### Why a separate `<details>` block
 *
 * Matches `AssetLoadingSection` and `GpuTimingsSection` — the user can
 * collapse the toggle list once they've finished poking at it.  The
 * section defaults to closed because most sessions won't need it; the
 * other two sections default to open because their data is the
 * primary reason someone opened the panel.
 */

import type { ReactElement } from 'react';

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
  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Renderer Toggles</summary>
      <div style={{ marginTop: 4 }}>
        {passNames.map((name) => {
          const isDisabled = disabledPasses[name] === true;
          return (
            <label
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                opacity: isDisabled ? 0.5 : 1,
              }}
            >
              <input type="checkbox" checked={!isDisabled} onChange={() => onTogglePass(name)} />
              <span>{name}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
