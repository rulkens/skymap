/**
 * clickHandler — wraps the GPU pick + selection-resolution step the
 * engine runs in response to a canvas click.
 *
 * Before this module existed, the click flow lived inline in the
 * `attachOrbitControls({ onClick })` callback inside engine.ts's
 * async IIFE.  It read four closure variables (`pickRendererHandle`,
 * `renderer.loadedSources()`, `visibleSourceMask`, `clouds`) and was
 * tangled with the engine's `setSelected` notification path.
 *
 * Pulling the pick → selection-index chain into a tiny resolver gives us:
 *
 *   1. A unit-testable "given a click position + a mocked picker, do
 *      we end up with the right selection index?" — no GPU device
 *      required.
 *   2. A clear seam between the engine ("I want a click resolved")
 *      and the GPU ("here's a pick texture readback").  Future work
 *      (e.g. hover halos) can reuse the resolver without inheriting
 *      the click-specific call site.
 *   3. The pick → resolveGlobalIdx walk + the optional PointInfo
 *      build live in one place, where they're easy to keep consistent
 *      with the per-frame hover pick gate further up in engine.ts.
 *
 * ### What the resolver returns
 *
 * The engine's `selectedIndex` state is a *global* instance index
 * (the picker's return value), and a click on background should clear
 * the selection.  The resolver therefore returns one of three states:
 *
 *   - `{ kind: 'clear' }`   — the picker returned -1 (background, or
 *                              another pick was already in flight).
 *                              Engine should call `setSelected(null)`.
 *
 *   - `{ kind: 'select', globalIdx, info }` — the picker hit a point
 *                              and we successfully built a PointInfo.
 *                              Engine should call `setSelected(globalIdx)`.
 *                              `info` is ALSO returned for callers that
 *                              want it (e.g. an "auto-focus on click"
 *                              future feature) without re-running
 *                              `pointInfoFromGlobal`.
 *
 *   - `{ kind: 'select', globalIdx, info: null }` — picker hit a point
 *                              but resolveGlobalIdx or buildPointInfo
 *                              failed.  Engine still selects globalIdx
 *                              for parity with the pre-extraction
 *                              behaviour: the old code did
 *                              `setSelected(idx)` regardless of whether
 *                              `pointInfoFromGlobal` would later return
 *                              null at the hover/select callback edge.
 *
 * Collapsing those into a single shape keeps the engine call site to
 * one switch (or two-line if/else) without losing information.
 *
 * The resolver does NOT call `requestRender()` — that's the engine's
 * job after it updates `selectedIndex`.  Keeping the resolver
 * scheduler-free means tests don't need a render-scheduler stub.
 *
 * ### Idempotency / in-flight calls
 *
 * The underlying `pickRenderer.pick` already handles the "second call
 * before the first resolves returns -1 immediately" race — see the
 * comment on `pickRenderer.pick`.  We mirror that contract: a click
 * fired during another in-flight pick resolves to `{ kind: 'clear' }`
 * rather than queueing.  Click frequency is low enough that the user
 * never notices.
 */

import type { PointCloud, PointInfo } from '../../@types';
import { Source } from '../../data/sources';
import type { createPickRenderer } from '../gpu/pickRenderer';

/**
 * Snapshot of the renderer's per-source draw records the picker
 * needs.  Engine produces this from `renderer.loadedSources()`
 * filtered by the live visibility mask.
 */
export type PickSourceDraw = {
  readonly source: Source;
  readonly count: number;
  readonly vertexBuffer: GPUBuffer;
  readonly instanceIdOffset: number;
};

export type ClickResolveInput = {
  /** Click X coordinate in *texture-space* pixels (CSS × capped DPR). */
  pickXPx: number;
  /** Click Y coordinate in *texture-space* pixels (CSS × capped DPR). */
  pickYPx: number;
  /** Physical canvas size `[width, height]` in backing-store pixels. */
  viewportPx: [number, number];
  /** Visible per-source draw records — same shape pickRenderer.pick wants. */
  visibleSources: Iterable<PickSourceDraw>;
  /** Uniform buffer shared with PointRenderer; the picker reads, never writes. */
  uniformBuffer: GPUBuffer;
};

/**
 * Hook the engine provides to the resolver: given a global instance
 * index returned by the picker, resolve it into the (source, local
 * index, cloud) triple needed to build a PointInfo.  Production wires
 * this to engine.ts's existing `resolveGlobalIdx` plus a `clouds.get`
 * lookup; tests pass a stub.
 */
export type ResolveGlobalIdx = (
  globalIdx: number,
) => { source: Source; localIdx: number; cloud: PointCloud } | null;

/**
 * Hook the engine provides to the resolver: given a (cloud, localIdx,
 * source) triple, build a PointInfo.  Production wires this to
 * `pointInfoBuilder.buildPointInfo` with the engine's live `famousMeta`
 * and `famousXrefs` sidecars in scope; tests pass a stub.
 */
export type BuildPointInfo = (
  cloud: PointCloud,
  localIdx: number,
  source: Source,
) => PointInfo | null;

/**
 * Result of resolving a click.  See the module-level docstring for
 * the full state-machine commentary.
 */
export type ClickResolution =
  | { kind: 'clear' }
  | { kind: 'select'; globalIdx: number; info: PointInfo | null };

export type ClickResolver = {
  /** Resolve a click position → ClickResolution. */
  resolveClick(input: ClickResolveInput): Promise<ClickResolution>;
};

export type CreateClickResolverInput = {
  pickRenderer: ReturnType<typeof createPickRenderer>;
  resolveGlobalIdx: ResolveGlobalIdx;
  buildPointInfo: BuildPointInfo;
};

export function createClickResolver(input: CreateClickResolverInput): ClickResolver {
  const { pickRenderer, resolveGlobalIdx, buildPointInfo } = input;

  return {
    async resolveClick(args: ClickResolveInput): Promise<ClickResolution> {
      const idx = await pickRenderer.pick(
        args.viewportPx,
        args.pickXPx,
        args.pickYPx,
        args.visibleSources,
        args.uniformBuffer,
      );
      if (idx === -1) return { kind: 'clear' };
      // Try to build a PointInfo, but treat failure as "still select
      // the index" for parity with the pre-extraction engine — the
      // old code did `setSelected(idx)` regardless of whether
      // `pointInfoFromGlobal` would later resolve null.
      const resolved = resolveGlobalIdx(idx);
      const info = resolved
        ? buildPointInfo(resolved.cloud, resolved.localIdx, resolved.source)
        : null;
      return { kind: 'select', globalIdx: idx, info };
    },
  };
}
