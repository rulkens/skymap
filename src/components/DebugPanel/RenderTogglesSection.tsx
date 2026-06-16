/**
 * RenderTogglesSection — checkbox list for the DebugPanel that lets a
 * developer disable individual renderer passes at runtime.
 *
 * The intended use case is "I see two overlapping draws on screen and
 * I want to know which renderer is responsible for which".  Toggling
 * a pass off skips its draw block in the next frame; the
 * `passOverrides.setDisabled` handle dispatches the store write and the
 * one-shot render request that wakes the on-demand loop.
 *
 * ### Override semantics (one-way)
 *
 * The toggle can only HIDE a pass that would otherwise have rendered
 * this frame — it never force-enables a pass whose own `enabled()`
 * gate returned false (e.g. there are no thumbnails on screen, or the
 * settings panel turned filaments off).  This matches the encoder
 * loop: `pass.enabled() && !disabledPasses.has(pass.name)`.
 *
 * ### Where the disabled set lives
 *
 * The set is engine-owned settings state (`settings.debug.disabledPasses`),
 * read live via the `disabledPasses` prop (App subscribes with
 * `selectDisabledPasses`).  No local mirror: a toggle dispatches through
 * `passOverrides.setDisabled`, the store notifies synchronously, and the prop
 * flows the new set back down — the same "write through the handle, read back
 * via the selector" shape the pick-buffer toggle uses.
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
import type { PassOverridesHandle } from '../../@types/engine/handles/EngineDebugHandle';

export type RenderTogglesSectionProps = {
  passOverrides: PassOverridesHandle;
  /** Live disabled-pass set from the settings store (App subscribes). */
  disabledPasses: ReadonlySet<string>;
};

export function RenderTogglesSection({
  passOverrides,
  disabledPasses,
}: RenderTogglesSectionProps): ReactElement {
  const toggle = (name: string) => {
    passOverrides.setDisabled(name, !disabledPasses.has(name));
  };

  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Renderer Toggles</summary>
      <div style={{ marginTop: 4 }}>
        {passOverrides.allNames.map((name) => {
          const isDisabled = disabledPasses.has(name);
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
              <input type="checkbox" checked={!isDisabled} onChange={() => toggle(name)} />
              <span>{name}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
