/**
 * RenderTargets — the single owner of every offscreen `RenderTargetSpec`
 * row's GPU texture lifecycle.
 *
 * Pre-unification the HDR target and the half-res volume target each had
 * their own module (`postProcess.ts`, `volumeOffscreen.ts`), each with its
 * own construct / resize / destroy triple and its own `state.gpu.*` field.
 * That meant the frame's resize handler enumerated the pair by hand, the
 * bootstrap gate checked two handles that always flip together, and the
 * executor's view resolution reached into two separate context fields.
 * Collapsing them onto one table-driven owner removes that duplication: the
 * offscreen rows (`hdr`, `volume`, …) are DATA — a `RenderTargetSpec[]` — and
 * this handle allocates, reconciles, and releases every row uniformly.
 *
 * `viewOf` resolves an offscreen row's current colour-attachment view. The
 * `swap` row is deliberately NOT allocated here — the swap chain is an
 * acquired texture (`context.getCurrentTexture()`), not one this owner
 * creates — so `viewOf('swap')` throws; the executor resolves swap from the
 * per-frame acquired view instead. Keeping that one asymmetry to a throwing
 * lookup (rather than a nullable return) makes a mis-wired swap resolution a
 * loud failure, not a silent null.
 *
 * `depthViewOf` mirrors that shape for the rows whose spec declares `depth`
 * (`foreground:0` — an opaque pass that occludes by depth-test). Depthless
 * rows have no depth texture, so `depthViewOf` throws for them just as it
 * does for unknown ids and `swap` — the executor only calls it for a target
 * whose spec row carries a non-null `depth`.
 */

import type { EngineState } from '../engine/state/EngineState';
import type { RenderTargetSpec } from '../engine/frame/RenderTargetSpec';
import type { Size } from './Size';

export type RenderTargets = {
  /**
   * The concrete target table this owner instantiates — the offscreen rows
   * (`hdr`, `volume`, `foreground:0`) plus the `swap` row (whose format is the
   * swap-chain format handed in at construction). The half of the
   * target↔renderer-profile invariant that lives on the target side.
   */
  readonly specs: readonly RenderTargetSpec[];
  /**
   * The declared row for `id` — the throwing counterpart to scanning `specs`
   * by hand. Throws for an unknown id (same loud-failure discipline as
   * `viewOf`), so a caller reading a spec-table fact (a row's `format`,
   * `scale`, or `clearValue`) never silently falls back to `undefined`.
   */
  specOf(id: string): RenderTargetSpec;
  /**
   * Allocated pixel dimensions of an offscreen row — the throwing
   * counterpart to reading a texture's size by hand. Throws for `swap` (no
   * allocated texture) and any unknown id, matching `viewOf`.
   *
   * A caller wanting "the viewport this row draws at" should read THIS, not
   * `ctx.canvasSize` divided by the spec's `scale`: the two can only
   * disagree in the window between a canvas resize and that frame's
   * reconcile, which `runFrame` makes unreachable (reconcile runs before
   * `deriveFrameContext`) — so the allocated size is true by construction.
   */
  sizeOf(id: string): Size;
  /**
   * Current colour-attachment view for an OFFSCREEN row (`hdr`, `volume`,
   * `foreground:0`). Stable until a `reconcile` moves this row. Throws for `swap` (and
   * any unknown id): the swap chain is executor-resolved from the acquired
   * frame view, not an allocated texture this owner holds.
   */
  viewOf(id: string): GPUTextureView;
  /**
   * Current depth-attachment view for a row whose spec declares `depth`
   * (`foreground:0`). Stable until a `reconcile` moves this row. Throws for depthless
   * rows (`hdr`, `volume`), `swap`, and any unknown id — an absent depth view
   * means the row has no depth attachment, not a nullable success.
   */
  depthViewOf(id: string): GPUTextureView;
  /**
   * Bring every offscreen row up to date with `size` and the live `state`:
   * resolve each row's desired `floor(size / scale)` per axis (min 1 px) and
   * reallocate only the rows whose allocated size no longer matches (a
   * depth-bearing row's depth texture moves with its colour texture). The ONE
   * seam answering both a canvas resize and a settings-driven divisor move —
   * `runFrame` calls it unconditionally, and a frame where nothing moved
   * allocates nothing.
   */
  reconcile(state: EngineState, size: Size): void;
  /**
   * Replace the `swap` row's format in `specs` — the single home for the
   * live swap-chain format, so a caller that reconfigures the swap chain
   * (e.g. toggling HDR display output) has one place to update it.
   * Allocates nothing: the swap row has no backing texture (see `viewOf`).
   */
  setSwapFormat(next: GPUTextureFormat): void;
  /** Tear down — releases every allocated offscreen texture. */
  destroy(): void;
};
