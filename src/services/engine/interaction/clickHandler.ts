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

import type { PointInfo } from '../../../@types/engine/PointInfo';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { PointCloud } from '../../../@types/data/PointCloud';
import { Source } from '../../../data/sources';
import type { createPickRenderer } from '../../gpu/renderers/pickRenderer';

/**
 * Snapshot of the renderer's per-source draw records the picker
 * needs.  Engine produces this from `renderer.loadedSources()`
 * filtered by the live visibility mask.
 *
 * `cloudBindGroup` is the per-source `@group(1)` (CloudFade) binding
 * carrying this source's `opacity` + 5-bit `sourceCode`.  PickRenderer
 * binds it before each per-source draw so its vertex stage can compose
 * the same `(sourceCode << 27) | instance_index` packed identity the
 * visual pass does — without baking anything per-vertex.
 */
export type PickSourceDraw = {
  readonly source: Source;
  readonly count: number;
  readonly vertexBuffer: GPUBuffer;
  readonly cloudFadeBuffer: GPUBuffer;
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
  /**
   * The user's current `pointSizePx` setting.  Forwarded to
   * `pickRenderer.pick` so it can boost the picking floor (see
   * `PICK_PADDING_PX` in pickRenderer.ts) — distant point-like
   * galaxies get a wider hit-test area, making them easier to click.
   * Optional so legacy callers that don't yet thread the setting
   * through can still construct a ClickResolveInput.
   */
  pointSizePx?: number;
};

/**
 * Hook the engine provides to the resolver: given a (source, localIdx)
 * pair the picker returned, resolve it into the cloud needed to build
 * a PointInfo.  Production wires this to engine.ts's `clouds.get(source)`
 * lookup; tests pass a stub.
 *
 * Returns `null` when the source's cloud isn't loaded (yet) or when
 * `localIdx >= cloud.count` (tier-swap window where the picker's
 * baked identity references a row past the freshly-uploaded smaller
 * cloud — the bounds check defends against the same race the prior
 * `fromGlobalIdx` decoder did).
 */
export type ResolveSelection = (
  selection: { source: Source; localIdx: number },
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
 *
 * The `selection` field carries the (source, localIdx) pair the picker
 * decoded from the r32uint texture's packed value.  Engine forwards it
 * straight to `setSelected` for the halo + InfoCard updates; no
 * intermediate global ID is needed.
 */
export type ClickResolution =
  | { kind: 'clear' }
  | {
      kind: 'select';
      selection: { source: Source; localIdx: number };
      info: PointInfo | null;
    };

export type ClickResolver = {
  /** Resolve a click position → ClickResolution. */
  resolveClick(input: ClickResolveInput): Promise<ClickResolution>;
  /**
   * Tear down the resolver.  No-op — the resolver is a thin wrapper
   * around the pick renderer plus two pure resolution closures; its
   * dependencies (pickRenderer, resolveSelection, buildPointInfo) are
   * owned by the engine and torn down separately.  Method exists so
   * the engine's bag of subsystems can be torn down uniformly via the
   * shared `Destroyable` shape (`engine.destroy()` iterates and calls
   * `destroy()` on each).
   */
  destroy(): void;
};

export type CreateClickResolverInput = {
  pickRenderer: ReturnType<typeof createPickRenderer>;
  resolveSelection: ResolveSelection;
  buildPointInfo: BuildPointInfo;
};

export function createClickResolver(input: CreateClickResolverInput): ClickResolver {
  const { pickRenderer, resolveSelection, buildPointInfo } = input;

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the click resolver is one of
  // the engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const resolver: ClickResolver = {
    async resolveClick(args: ClickResolveInput): Promise<ClickResolution> {
      const result = await pickRenderer.pick(
        args.viewportPx,
        args.pickXPx,
        args.pickYPx,
        args.visibleSources,
        args.pointSizePx,
      );
      if (result === null) return { kind: 'clear' };
      // Try to build a PointInfo, but treat failure as "still select
      // the (source, localIdx)" for parity with the pre-extraction
      // engine — the old code did `setSelected(idx)` regardless of
      // whether `pointInfoFromGlobal` would later resolve null.
      const resolved = resolveSelection(result);
      const info = resolved
        ? buildPointInfo(resolved.cloud, resolved.localIdx, resolved.source)
        : null;
      return { kind: 'select', selection: result, info };
    },
    destroy(): void {
      // Intentionally empty — see the type-level docstring for why.
    },
  };
  resolver satisfies Destroyable;
  return resolver;
}
