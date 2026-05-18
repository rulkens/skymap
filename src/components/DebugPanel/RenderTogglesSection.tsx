/**
 * RenderTogglesSection — checkbox list for the DebugPanel that lets a
 * developer disable individual renderer passes at runtime.
 *
 * The intended use case is "I see two overlapping draws on screen and
 * I want to know which renderer is responsible for which".  Toggling
 * a pass off skips its draw block in the next frame; the
 * `passOverrides` handle on the engine handles both the state mutation
 * and the one-shot render request that wakes the on-demand loop.
 *
 * ### Override semantics (one-way)
 *
 * The toggle can only HIDE a pass that would otherwise have rendered
 * this frame — it never force-enables a pass whose own `enabled()`
 * gate returned false (e.g. there are no thumbnails on screen, or the
 * settings panel turned filaments off).  This matches the encoder
 * loop: `pass.enabled() && !disabledPasses.has(pass.name)`.
 *
 * ### Why local React state mirrors the handle's set
 *
 * The handle is an imperative façade — there's no subscribe channel.
 * Mirroring the disabled set in component state means the checkbox
 * stays in sync with the toggle action without polling.  The mirror
 * is initialised on mount by querying `isDisabled` per name; after
 * that React owns the source of truth for what the UI shows, and
 * each toggle simultaneously updates React state AND calls
 * `setDisabled` on the handle.  If the engine handle is ever recreated
 * (HMR + a new `createEngine`), the parent DebugPanel remounts this
 * section with a fresh mirror.
 *
 * ### Why a separate `<details>` block
 *
 * Matches `AssetLoadingSection` and `GpuTimingsSection` — the user can
 * collapse the toggle list once they've finished poking at it.  The
 * section defaults to closed because most sessions won't need it; the
 * other two sections default to open because their data is the
 * primary reason someone opened the panel.
 */

import { useState, type ReactElement } from 'react';
import type { PassOverridesHandle } from '../../@types/engine/handles/EngineDebugHandle';

export type RenderTogglesSectionProps = {
  passOverrides: PassOverridesHandle;
};

export function RenderTogglesSection({ passOverrides }: RenderTogglesSectionProps): ReactElement {
  // Mirror the handle's disabled set in component state so React drives
  // the checkbox `checked` attribute without per-render polling.
  // Initialised from the handle once on mount.
  const [disabled, setDisabled] = useState<ReadonlySet<string>>(() => {
    const initial = new Set<string>();
    for (const name of passOverrides.allNames) {
      if (passOverrides.isDisabled(name)) initial.add(name);
    }
    return initial;
  });

  const toggle = (name: string) => {
    const next = new Set(disabled);
    const isCurrentlyDisabled = next.has(name);
    if (isCurrentlyDisabled) next.delete(name);
    else next.add(name);
    setDisabled(next);
    passOverrides.setDisabled(name, !isCurrentlyDisabled);
  };

  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Renderer Toggles</summary>
      <div style={{ marginTop: 4 }}>
        {passOverrides.allNames.map((name) => {
          const isDisabled = disabled.has(name);
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
