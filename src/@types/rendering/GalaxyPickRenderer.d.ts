/**
 * GalaxyPickRenderer — public surface of the point-pick draw provider.
 *
 * Create one instance at startup with `createGalaxyPickRenderer(device, ...)` and
 * keep it alive for the duration of the app.  It records the galaxy
 * point-billboard draw into an r32uint pick pass owned by the pick program
 * (`pickProgram.ts`); it owns no pass, no texture, and no readback.  The pick
 * program begins the pass, drives the single-pixel readback, and folds
 * results across slabs — this renderer is one `drawPick` provider among the
 * content-layer registry's pickable rows.
 */

import type { PickSourceDraw } from './PickSourceDraw';

export type GalaxyPickRenderer = {
  /**
   * Human-readable identifier (`'galaxyPickRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;

  /**
   * Record the point-pick draw into an already-begun render pass.
   *
   * Uploads `uniformBytes` VERBATIM to the renderer's OWN pick uniform buffer,
   * binds `@group(0)` (camera), `@group(1)` (dummy fade), `@group(3)` (focus),
   * then issues one instanced draw per source.  The caller owns
   * `beginRenderPass` / `pass.end()`.
   *
   * ### Uniform buffer contract
   *
   * The visual pass's GPU buffer is NEVER touched — there is no shared
   * buffer, no two-writer hazard, and no dependency on frame ordering.
   * `uniformBytes` is the COMPLETE, already-pick-shaped image built at pick
   * time from the slab view (see `pickUniformBytesOf` — none-selection
   * sentinel, `+PICK_PADDING_PX` point size, and `pickPass = 1` all baked in),
   * so this method uploads it as-is with no post-upload patching. The pick
   * byte-shaping lives in one place, the pick packer.
   *
   * ### @group(0) prefix contract
   *
   * This method uploads the camera uniform and binds `@group(0)` **even with
   * zero sources** — a galaxy-empty scene (every catalog toggled off) must
   * still leave slot 0 pointing at the freshly-uploaded pick camera buffer
   * for any sibling `drawPick` that reads the pick camera through that prefix.
   * The per-source loop simply issues no draws.
   *
   * @param pass         An already-begun `GPURenderPassEncoder`.
   * @param sources      Per-source draw records, one per visible galaxy
   *                     catalog, in `Source` enum order.  The caller filters
   *                     by visibility mask — the picker draws every record it
   *                     receives.
   * @param uniformBytes The complete pick-shaped uniform bytes for the pick
   *                     frame (see `pickUniformBytesOf`).
   */
  drawPoints(
    pass: GPURenderPassEncoder,
    sources: readonly PickSourceDraw[],
    uniformBytes: ArrayBuffer,
  ): void;

  /**
   * Re-bind `@group(0)` to the point-pick camera uniform (the buffer
   * `drawPoints` last uploaded).
   *
   * This exists so any `drawPick` that must bind its OWN slot-0 uniform can
   * restore the shared camera prefix before returning. A sibling pick
   * pipeline may read the pick camera through the caller-bound `@group(0)`
   * prefix while binding nothing itself; a `drawPick` that clobbers slot 0
   * (the procedural-disk pick binds the disk camera there) would leave those
   * fold-in draws reading the wrong buffer — and once a mirror's read extent
   * exceeds the disk uniform, that is a hard validation error, not just a
   * wrong hit. Call `bindCamera(pass)` at the end of such a `drawPick` to put
   * slot 0 back.
   */
  bindCamera(pass: GPURenderPassEncoder): void;

  /**
   * Release all GPU resources owned by this renderer.
   *
   * Call this if you ever destroy and recreate the renderer (e.g. after a
   * device loss recovery).
   */
  destroy(): void;
};
