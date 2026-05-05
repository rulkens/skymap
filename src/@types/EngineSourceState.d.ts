/**
 * EngineSourceState — loaded data + visibility selectors sub-bag of the
 * canonical `EngineState`.
 *
 * ### What this sub-bag owns
 *
 *   - `visibleMask` — 32-bit per-source bitmask; the renderer's per-source
 *                      draw loop skips buffers whose bit is clear.  Updated
 *                      by both `setSourceVisible` and the auto-LOD recompute
 *                      that fires when the camera distance crosses a band
 *                      threshold.
 *   - `lodMode` — decides who owns the mask each frame.  In `'auto'` the
 *                  engine recomputes it via `autoLodMask(camera.distance)`;
 *                  in `'manual'` whatever was last assigned stays put.
 *   - `clouds` — CPU-side mirror of every uploaded `PointCloud`, keyed by
 *                 `Source`.  Required for picking / hover (resolving a
 *                 GPU instance index back into PointInfo) and for the
 *                 cross-cloud framing snapshot.
 *   - `famousMeta` / `famousXrefs` — optional sidecars that enrich the
 *                                     InfoCard text for the Famous catalog.
 *                                     Empty until the fetch resolves;
 *                                     consumers null-check before reading.
 *
 * ### Why a separate type
 *
 * The bag groups everything that answers "what's currently loaded and
 * visible?" — the same question many UI subsystems ask.  Keeping it
 * named lets future helpers accept just this slice (`(sources:
 * EngineSourceState) => ...`) rather than the whole engine state, which
 * is otherwise a recipe for callers reaching into unrelated bags.
 */

import type { LodMode } from './LodMode';
import type { PointCloud } from './PointCloud';
import type { Source } from '../data/sources';
import type { FamousMetaEntry, FamousXrefMap } from '../services/engine/famousMetaLoader';

export type EngineSourceState = {
  visibleMask: number;
  lodMode: LodMode;
  clouds: Map<Source, PointCloud>;
  famousMeta: FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
};
