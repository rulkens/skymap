/**
 * labelStyleOverride — process-wide, single-slot live-tuning hook for
 * the DebugPanel's LabelEffectsSection.
 *
 * ### Why module-scoped mutable state?
 *
 * The override is a developer-only debug hook: while the DebugPanel
 * has it on, every label-emitting subsystem consults the current
 * value at frame-build time and substitutes the override's outline +
 * glow fields for its own producer defaults.  React state in the
 * panel component is the wrong shape because the engine's per-frame
 * code runs outside React's render loop and would need a ref or
 * useEffect to read the current values; a plain module-scoped object
 * is read directly by every producer with zero ceremony.
 *
 * ### Why a single slot, not a per-category record?
 *
 * The workflow is "select category, tune, bake into POI_STYLES, move
 * to next category".  A per-category record would invite the user to
 * leave overrides stale across category switches; the single slot
 * makes the active target unambiguous.
 *
 * ### Why default targetCategory = null?
 *
 * Production startup should never accidentally apply an override.
 * The DebugPanel only exists in DEV builds or when ?debug is in the
 * URL, so a non-DEV runtime never even calls `setLabelStyleOverride`.
 * Defaulting to null means "no producer matches" and the override is
 * completely inert until a developer opens the panel and picks a
 * category.
 */

import type { Vec4 } from '../../@types/math/Vec4';
import type { PoiCategory } from './subsystems/poiSubsystem';

/**
 * The set of label-emitting categories the override can target.
 * Mirrors the dropdown in `LabelEffectsSection.tsx` — keep in sync.
 */
export type LabelStyleOverrideTarget = 'youAreHere' | PoiCategory;

/**
 * Read-only snapshot of the current override.  `targetCategory` is
 * null when the override is inactive.
 */
export type LabelStyleOverride = {
  readonly targetCategory: LabelStyleOverrideTarget | null;
  readonly outlineColor: Vec4;
  readonly outlineEmFrac: number;
  readonly glowColor: Vec4;
  readonly glowEmFrac: number;
};

// The single mutable slot.  Reassigned (not mutated in place) by
// `setLabelStyleOverride` so any consumer that captured the prior
// reference sees a stable snapshot for the duration of one frame.
let current: LabelStyleOverride = {
  targetCategory: null,
  outlineColor: [0, 0, 0, 0],
  outlineEmFrac: 0,
  glowColor: [0, 0, 0, 0],
  glowEmFrac: 0,
};

export function getLabelStyleOverride(): LabelStyleOverride {
  return current;
}

export function setLabelStyleOverride(next: LabelStyleOverride): void {
  current = next;
}

export function clearLabelStyleOverride(): void {
  current = {
    targetCategory: null,
    outlineColor: [0, 0, 0, 0],
    outlineEmFrac: 0,
    glowColor: [0, 0, 0, 0],
    glowEmFrac: 0,
  };
}
