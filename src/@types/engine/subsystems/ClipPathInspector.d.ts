/**
 * ClipPathInspector — the debug subsystem that holds the precomputed
 * `ClipPathSnapshot` for the clip-path overlay.
 *
 * The snapshot is computed ONCE on the debug panel's "Calculate" click (via the
 * `computeClipPath` saga-context seam) and handed here; the clip-path debug
 * pass reads it each frame to draw the speed-coloured route + scrub gizmo. Keeping
 * the sampled geometry (hundreds of poses) in a subsystem — not Redux — keeps
 * the store holding only the scalars (`clipId`, `scrubT`) the UI owns.
 *
 * `destroy()` clears the snapshot to satisfy the `EngineSubsystemHandles`
 * Destroyable guard; there are no GPU resources to free.
 */

import type { ClipPathSnapshot } from '../debug/ClipPathSnapshot';
import type { Destroyable } from '../../rendering/Destroyable';

export type ClipPathInspector = {
  /** Replace the held snapshot (called by the computeClipPath seam). */
  setSnapshot(snapshot: ClipPathSnapshot): void;
  /** Drop the snapshot (the "Clear" button). */
  clear(): void;
  /** The current snapshot, or null when nothing has been computed. */
  current(): ClipPathSnapshot | null;
} & Destroyable;
