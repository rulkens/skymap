import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../src/@types/math/Vec4';
import type { GridBox } from './GridBox';
import type { GridBudget } from './GridBudget';
import type { GridElement } from './GridElement';

/**
 * GridSlice — the grid-box CONFIG (what the panel edits) plus the last
 * RESOLVED box (what the sim actually runs on). `box`/`resolvedElement`/
 * `byteBudget` are null until the first successful build — the panel can be
 * open before any catalog has loaded. Derivation is always the manual path:
 * center + size + a long-axis resolution, never free dims (`autoFitGridBox`'s
 * own contract) — `divisor` is the one resolution lever (see `deriveGridBox`).
 *
 * "Auto fit" is a one-shot ACTION (`fitBoxToCatalog`, gridSlice.ts), not a
 * persistent mode: it snapshots the current catalog bounds straight into
 * `manualCenterMpc`/`manualSizeMpc` once, `paddingMpc` baked in at click
 * time. There is no boolean flag recording "how the box got here" — after
 * the click it's an ordinary manual box, editable the same as any hand-tuned
 * one.
 *
 * `importedBox` is V3's load-side override: `deriveGridBox` returns it
 * VERBATIM when set, so a loaded preset reloads to a bit-identical box
 * regardless of divisor/manual bounds. Every setter below that represents a
 * user editing the grid controls (including `fitBoxToCatalog`) clears it
 * back to null — the override exists only until the user starts steering
 * again.
 *
 * `showGridBox` (F1.7) is view state, not a grid-box edit — its setter does
 * NOT clear `importedBox` and it is never written into a preset (see
 * exportParams/importParams, which only round-trip the resolved `GridBox`).
 * Default true keeps the gizmo reachable; Viewport OR-composes it with the
 * existing 200ms post-edit preview and the live-drag hold.
 *
 * `manualRotation` (F2.5) is rotation's own manual-path home, the same shape
 * `manualCenterMpc`/`manualSizeMpc` already have: `deriveGridBox` writes it
 * into the derived box's `rotation` field (autoFitGridBox itself always
 * returns identity — it has no rotation concept), and `installImportedBox`
 * syncs it from a loaded preset exactly as it syncs center/size, so a
 * translate/resize drag on a loaded ROTATED box (which clears `importedBox`,
 * V3) doesn't snap the box back to identity the instant it falls onto the
 * manual path.
 */
export type GridSlice = {
  readonly divisor: number;
  readonly paddingMpc: number;
  readonly manualCenterMpc: Vec3;
  readonly manualSizeMpc: Vec3;
  readonly manualRotation: Readonly<Vec4>;
  readonly importedBox: GridBox | null;
  readonly box: GridBox | null;
  readonly resolvedElement: GridElement | null;
  readonly byteBudget: GridBudget | null;
  readonly showGridBox: boolean;
};
