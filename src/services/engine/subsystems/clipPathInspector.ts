/**
 * clipPathInspector — holds the precomputed `ClipPathSnapshot` for the debug
 * clip-path overlay. A trivial mutable cell: the `computeClipPath` seam writes
 * it on the "Calculate" click, `produceClipPathLines` reads it each frame, and
 * "Clear" (or destroy) drops it.
 *
 * The geometry deliberately lives here rather than in Redux — the store keeps
 * only the `clipId` / `scrubT` scalars the UI owns. Eager (no GPU dep), non-null
 * from t=0, snapshot null until the first Calculate.
 */

import type { ClipPathInspector } from '../../../@types/engine/subsystems/ClipPathInspector';
import type { ClipPathSnapshot } from '../../../@types/engine/debug/ClipPathSnapshot';

export function createClipPathInspector(): ClipPathInspector {
  let snapshot: ClipPathSnapshot | null = null;

  return {
    setSnapshot(next: ClipPathSnapshot): void {
      snapshot = next;
    },
    clear(): void {
      snapshot = null;
    },
    current(): ClipPathSnapshot | null {
      return snapshot;
    },
    destroy(): void {
      snapshot = null;
    },
  };
}
