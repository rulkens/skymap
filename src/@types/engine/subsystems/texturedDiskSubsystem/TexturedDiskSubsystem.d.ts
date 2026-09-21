/**
 * TexturedDiskSubsystem — LOD-2 per-frame planner.
 *
 * Walks the catalog, applies the px ≥ 24 fetch gate, allocates atlas
 * slots through the injected `TileStreamSubsystem<ImageBitmap>`, schedules fetches,
 * computes load-fade + distance-fade multipliers, sorts back-to-front,
 * emits the disk array. Every encoded galaxy has finite (axisRatio, PA)
 * — `tools/catalog/buildAllBins.ts` supplies a deterministic hash-based
 * fallback for sources without measured orientation — so there is no
 * screen-aligned quad branch here.
 *
 * Owns the per-key `bitmapReadyTime` map (load-fade window state) and
 * subscribes to the atlas's eviction handler to clear entries when a
 * slot is recycled.
 */

import type { Destroyable } from '../../../rendering/Destroyable';
import type { DiskRowVisitor } from '../DiskRowVisitor';
import type { HiResFamousSubsystem } from '../hiResFamousSubsystem/HiResFamousSubsystem';
import type { TexturedDiskFrameInput } from './TexturedDiskFrameInput';
import type { TexturedDiskFrameOutput } from './TexturedDiskFrameOutput';
export type TexturedDiskSubsystem = Destroyable & {
  /**
   * Start a frame: returns the `DiskRowVisitor` the shared walk drives for
   * this frame.  The visitor closes over this subsystem's sticky maps, a
   * fresh per-frame disk accumulator, and the frame's `famousGalaxiesMeta` / `nowMs`
   * extras; its `endFrame` sorts back-to-front and stashes the result on
   * `lastOutput` so the pass file can read it without re-running.
   */
  beginFrame(input: TexturedDiskFrameInput): DiskRowVisitor;

  readonly lastOutput: TexturedDiskFrameOutput;

  /**
   * True only while a bitmap that actually ARRIVED is inside its 400 ms
   * load-fade window — the Layer's whole per-frame work vote, feeding both
   * the render-on-demand predicate and every sky capture's re-bake gate.
   *
   * An outstanding fetch is deliberately absent: the atlas wakes a frame via
   * `requestRender()` on every settle, so a pending request needs no vote,
   * and voting one let a thumbnail host that hangs for its 30 s deadline both
   * spin the loop and re-bake six cubemap faces per frame while nothing on
   * screen changed.
   */
  hasFadingContent(): boolean;

  /**
   * Swap the hi-res LOD-3 planner read per frame. The pair lives behind
   * the `hi-res-famous` asset slot (`wireHiResFamousSlot.ts`): its
   * `commit` binds the new texture view and calls this BEFORE destroying
   * the previous pair, so the renderer keeps drawing the old pair until
   * commit hands over the new one — no frame samples a torn-down
   * planner's `lastOutput.byFamousIdx`. A tier flip changes the desired
   * `layerSide`; the demand loop's request-drift edge detects the
   * mismatch and reloads the slot in place.
   *
   * Swapping just the planner — rather than rebuilding the whole
   * texturedDiskSubsystem — keeps the per-key load-fade timestamps and
   * sticky disk maps for SDSS / 2MRS / GLADE galaxies intact; only the
   * famous hi-res state changes.
   *
   * Pass `undefined` to detach. Every Famous-source disk then emits
   * `hiResLayerIdx: -1, hiResCrossfadeAlpha: 0` until a new planner is
   * installed.
   */
  setHiResFamous(hiResFamous: HiResFamousSubsystem | undefined): void;
};
