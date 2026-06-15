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
 * The workflow is "select category, tune, bake into the structure marker styles, move
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
import type { LabelCategory } from '../../@types/engine/data/LabelCategory';

/**
 * The set of label-bearing categories the override can target — exactly
 * the registry's `LABEL_CATEGORIES` (`milkyWay` included).  Mirrors the
 * dropdown in `LabelEffectsSection.tsx` — keep in sync.
 */
export type LabelStyleOverrideTarget = LabelCategory;

/**
 * Read-only snapshot of the current override.  `targetCategory` is
 * null when the override is inactive.
 */
export type LabelStyleOverride = {
  readonly targetCategory: LabelStyleOverrideTarget | null;
  readonly outlineColor: Vec4;
  readonly outlineEmFrac: number;
};

// The single mutable slot.  Reassigned (not mutated in place) by
// `setLabelStyleOverride` so any consumer that captured the prior
// reference sees a stable snapshot for the duration of one frame.
let current: LabelStyleOverride = {
  targetCategory: null,
  outlineColor: [0, 0, 0, 0],
  outlineEmFrac: 0,
};

// Monotonic version counter — incremented on every set/clear.  The
// label director includes this in its signature hash so an override
// edit triggers a re-flush even when the merged label set is
// id+fadeAlpha-stable.  Cheaper than a listener channel and impossible
// to leak (no subscribers to forget to dispose).
let version = 0;

// Wake callback — the engine bootstrap registers a closure that calls
// `scheduler.requestRender()`.  Without this, the version bump only
// causes a re-flush IF a frame happens to run; render-on-demand sits
// idle until the user nudges the mouse.  Registration is module-scoped
// because the override has no constructor seam to receive deps.
let wake: (() => void) | null = null;

export function getLabelStyleOverride(): LabelStyleOverride {
  return current;
}

export function getLabelStyleOverrideVersion(): number {
  return version;
}

export function setLabelStyleOverride(next: LabelStyleOverride): void {
  current = next;
  version++;
  wake?.();
}

export function clearLabelStyleOverride(): void {
  current = {
    targetCategory: null,
    outlineColor: [0, 0, 0, 0],
    outlineEmFrac: 0,
  };
  version++;
  wake?.();
}

/**
 * Register a wake callback fired on every override set/clear.  The
 * engine's bootstrap wires this to `scheduler.requestRender()` so a
 * DebugPanel slider edit wakes the render-on-demand loop in addition
 * to bumping the director's signature hash.  Tests can leave this
 * unregistered — the version counter still works.
 */
export function registerLabelStyleOverrideWake(fn: () => void): void {
  wake = fn;
}
