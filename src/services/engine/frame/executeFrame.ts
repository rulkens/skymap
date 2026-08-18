/**
 * executeFrame — the single imperative site that walks one `FrameStep[]`
 * program into one GPU command encoder. This is the heart of the renderer
 * unification: pre-unification the frame's order lived as an implicit call
 * chain spread across `renderFrame` and a hand-wired HDR-encode + tone-map +
 * UI-overlay sequence. `frameProgram` turned that order into data; this
 * executor is the one loop that consumes it.
 *
 * ### The step-kind switch is the frame's only switch
 *
 * Every per-layer, per-target, per-blend decision is resolved from data the
 * `ContentLayer`s and `FrameStep`s already carry — a render step selects its
 * group by matching `(target, slab)`, a composite names its blend/tone inline.
 * There are no layer-identity branches, no per-layer slab lookups (exactly one
 * `slabViewOf` per render step), and no membership-implies-blend logic. Adding a
 * near-field slab or a new composite is a new *row* in `frameProgram` / the
 * layer registry, not a new code path here.
 *
 * ### Tile-local mega-pass vs. per-layer timed passes (the strategy fork)
 *
 * On tile-based GPUs (Apple Silicon M1/M2, Adreno, Mali) the render target
 * lives in tile-local memory for the duration of one open render pass — no DRAM
 * round-trip between draws. Premultiplied-OVER layers (marker-lines, labels)
 * read `dst.color` from the same tile their predecessor wrote into, so the OVER
 * blend is computed against fully-coherent state. The `'merged'` strategy keeps
 * a target's whole group in one `beginRenderPass`, preserving that coherency —
 * this is the production path.
 *
 * The `'perLayerTimed'` strategy instead opens one pass per layer so each can
 * carry its own `timestampWrites` (WebGPU attaches timestamps at pass
 * BOUNDARIES, not to individual draws — per-pass timing has no other shape).
 * Every `pass.end` / `beginRenderPass(loadOp: 'load')` boundary stores and
 * reloads the target through DRAM; on M1 the OVER overlays reading `dst.color`
 * between boundaries see stale or partially-coherent data and render at the
 * wrong alpha. Additive layers tolerate this invisibly (their blend factor
 * `srcFactor: 'one', dstFactor: 'one'` doesn't read `dst.color`). That's why
 * `'perLayerTimed'` is the developer-only (`?gpuTimings`) path — the M1
 * coherency cost is paid only to obtain per-pass GPU timing.
 *
 * ### First-touch clear
 *
 * A per-frame `touched` set tracks which render targets have been drawn into.
 * The first pass opened against a target this frame uses `loadOp: 'clear'` with
 * that target's clear value; later passes use `'load'`. A render step with a
 * non-empty group marks its target touched; a composite marks its dest touched.
 * Unlike the old split path's dedicated no-draw clear pass, folding the clear
 * into the first enabled layer's pass is safe here because the group is already
 * filtered to enabled layers — a non-empty group always has a first layer to
 * carry the clear.
 *
 * The same `touched` fact drives depth: a render step whose target row declares
 * `depth` (only `foreground:0` today) attaches a depth texture whose load-op is
 * `'clear'` (to this slab's far-plane depth via `depthClearValueFor` — `0.0` under
 * the NEAR0 `foreground:0` row's reversed-Z convention) on first touch and `'load'` after — one
 * first-touch fact, two attachments — so a second render step or a
 * `perLayerTimed` pass reloads the depth already written and inter-layer
 * occlusion is preserved. Composite steps never attach depth (their dest rows
 * are depthless).
 */

import type { ExecuteFrameArgs } from '../../../@types/engine/frame/ExecuteFrameArgs';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ContentLayer } from '../../../@types/engine/frame/ContentLayer';
import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { GpuTimingService } from '../../../@types/gpu/timing/GpuTimingService';
import { slabViewOf, groupKeyOf } from './slabs';
import { encodeFlowCompute } from './encodeFlowCompute';
import { encodeAtmosphereSkyView } from './encodeAtmosphereSkyView';
import { runBloom } from './runBloom';
import { depthClearValueFor } from '../../../utils/gpu/depthClearValueFor';

/**
 * COMPUTE — the name→fn table a `'compute'` step dispatches through. Two rows
 * today (`'flow'` and `'atmosphereSkyView'`); a new compute pre-pass is a new
 * row, not a new branch. Every row takes the uniform `(encoder, ctx, state)`
 * shape — `flow` reads `ctx.nowMs` as its real-time advection clock, while
 * `atmosphereSkyView` reads the rendered pose off it so its baked LUT matches
 * what the shell fragment samples.
 */
const COMPUTE: Record<
  string,
  (encoder: GPUCommandEncoder, ctx: ReadyFrameContext, state: EngineState) => void
> = {
  flow: (encoder, ctx, state) => encodeFlowCompute(encoder, state, ctx.nowMs),
  atmosphereSkyView: (encoder, ctx, state) => encodeAtmosphereSkyView(encoder, ctx, state),
};

/**
 * Resolve a render-target id to its texture view. The swap-vs-offscreen branch
 * is essential — the swap chain is an acquired view (`args.swapView`), not an
 * allocated texture like the offscreen rows — so it stays confined to this one
 * site: every other id resolves through the render-target table, which throws
 * for ids it never allocated.
 */
function viewFor(id: string, ctx: ReadyFrameContext, swapView: GPUTextureView): GPUTextureView {
  if (id === 'swap') return swapView;
  return ctx.renderTargets.viewOf(id);
}

/** Build a colour attachment that clears (first touch) or loads (later). */
function colorAttachment(
  ctx: ReadyFrameContext,
  target: string,
  view: GPUTextureView,
  touched: boolean,
): GPURenderPassColorAttachment {
  if (touched) return { view, loadOp: 'load', storeOp: 'store' };
  return {
    view,
    loadOp: 'clear',
    clearValue: ctx.renderTargets.specOf(target).clearValue,
    storeOp: 'store',
  };
}

/**
 * Depth attachment for a target row that declares `depth`, spread into the
 * pass descriptor — `{}` (no key) for depthless rows. The SAME first-touch
 * `touched` fact that flips the colour load-op flips depth: one fact, two
 * attachments. The first pass against a depth target clears depth to the far
 * plane (1.0) so the initial depth-test always passes; later passes (a second
 * render step, or `perLayerTimed` passes after the first) load, preserving the
 * occlusion already written this frame. Composite steps never call this —
 * their dest rows are depthless — so the depth budget is confined to the
 * opaque render passes that own it.
 *
 * `specOf` throws for an unknown target, where the old `specs.find(...)` here
 * tolerated one (`undefined` → `{}`, no depth attachment). Unreachable in
 * production — `viewFor` throws first, at the top of `renderGroup` — so this
 * is a tightening, not a behaviour change.
 */
function depthAttachment(
  ctx: ReadyFrameContext,
  target: string,
  touched: boolean,
  reversedZ: boolean,
): { depthStencilAttachment?: GPURenderPassDepthStencilAttachment } {
  const spec = ctx.renderTargets.specOf(target);
  if (!spec.depth) return {};
  return {
    depthStencilAttachment: {
      view: ctx.renderTargets.depthViewOf(target),
      // Clear to the far-plane depth for THIS slab's convention, single-sourced
      // in depthClearValueFor so the clear and the depthCompare direction can
      // never disagree (a mismatch fights every fragment of the first draw).
      depthClearValue: depthClearValueFor(reversedZ),
      depthLoadOp: touched ? 'load' : 'clear',
      depthStoreOp: 'store',
    },
  };
}

/** Spread-if idiom: attach `timestampWrites` only when the service returns one. */
function timestampSpread(
  timing: GpuTimingService,
  slot: string,
): { timestampWrites?: GPURenderPassTimestampWrites } {
  const descriptor = timing.descriptorFor(slot);
  return descriptor ? { timestampWrites: descriptor } : {};
}

export function executeFrame(args: ExecuteFrameArgs): void {
  const { encoder, ctx, state, program, layers, strategy, timing, swapView } = args;

  // Per-`executeFrame` first-touch bookkeeping: a target id enters this set the
  // first time a pass is opened against it, flipping subsequent passes from
  // 'clear' to 'load'. This is the SAME object exposed on the ready context as
  // `renderedTargets`: the public type is `ReadonlySet` (the consumer surface),
  // but the concrete object `deriveFrameContext` builds is a real `Set`, so the
  // executor populates it here and later layers read which targets rendered this
  // frame via `ctx.renderedTargets`.
  const touched = ctx.renderedTargets as Set<string>;

  for (const step of program) {
    switch (step.kind) {
      case 'compute': {
        const compute = COMPUTE[step.name];
        if (!compute) {
          throw new Error(`executeFrame: no COMPUTE row for '${step.name}'`);
        }
        compute(encoder, ctx, state);
        break;
      }
      case 'render': {
        // The DebugPanel renderer-toggle override is one-way: it hides a layer
        // whose own `enabled()` gate returned true, and can never force-enable
        // one whose gate returned false — hence the check follows the gate.
        // Empty in production, so the membership lookup is in the noise.
        const disabledPasses = state.settings.debug.disabledPasses;
        const group = layers.filter(
          (l) =>
            l.target === step.target &&
            l.slab === step.slab &&
            l.enabled(state, ctx) &&
            disabledPasses[l.name] !== true,
        );
        if (group.length === 0) break;

        // The frame's ONLY slab resolution — one SlabView per render step,
        // threaded into every layer in the group.
        const view = slabViewOf(ctx, step.slab);
        // The merged pass bills its whole group against this one slot. The key
        // comes from the shared `groupKeyOf` helper (slabs.ts) — the same
        // definition `timedSlotRowsOf` allocates the slot under — so
        // `descriptorFor(groupKey)` resolves exactly that slot.
        const groupKey = groupKeyOf(step.target, step.slab);
        renderGroup(strategy, {
          encoder,
          ctx,
          state,
          timing,
          swapView,
          target: step.target,
          group,
          view,
          groupKey,
          alreadyTouched: touched.has(step.target),
        });
        touched.add(step.target);
        break;
      }
      case 'composite': {
        const { source, dest, blend, tone } = step.step;
        // Skip unless the source target was actually drawn into this frame:
        // compositing an untouched (uncleared, undefined) source is a no-op at
        // best and reads garbage at worst.
        if (!touched.has(source)) break;

        const pass = encoder.beginRenderPass({
          label: `composite-${source}->${dest}`,
          colorAttachments: [
            colorAttachment(ctx, dest, viewFor(dest, ctx, swapView), touched.has(dest)),
          ],
          ...timestampSpread(timing, `${source}→${dest}`),
        });
        // The compositor is minted in the same bootstrap phase as the render
        // targets, and the executor only runs past the ready-context gate —
        // so a null here is a wiring bug, not a frame-skippable condition.
        // Fail loudly rather than silently dropping the composite (which
        // would present an unmerged frame).
        const compositor = state.gpu.compositor;
        if (!compositor) {
          throw new Error('executeFrame: compositor missing for composite step');
        }
        // The compositor's pipeline bakes its colour-attachment format, so it
        // needs the dest's format up front (a pass encoder can't be queried for
        // its own target). Unlike the VIEW — where `swap` is executor-resolved
        // from the acquired frame texture, not the target table — the FORMAT is
        // a spec-table fact for every row including `swap` (whose spec carries
        // the swap-chain format), so it resolves uniformly with no swap branch.
        const dstFormat = ctx.renderTargets.specOf(dest).format;
        compositor.draw(pass, viewFor(source, ctx, swapView), blend, tone, dstFormat);
        pass.end();
        touched.add(dest);
        break;
      }
      case 'bloom': {
        // The bloom sub-pipeline runs its own strictly-ordered passes (bright →
        // downsample×4 → upsample×4 → fold), so unlike a `'render'` step it does
        // not go through the `(target, slab)` layer grouping — a ping-pong mip
        // pyramid reuses targets, which that grouping cannot express without
        // stale re-fires. `hdr` is already touched here (the program places
        // bloom after the body composite), so the fold loads it.
        runBloom(encoder, ctx, state, timing);
        break;
      }
    }
  }
}

/** One render step's group → GPU passes, per the active strategy. */
function renderGroup(
  strategy: RenderStrategy,
  p: {
    encoder: GPUCommandEncoder;
    ctx: ReadyFrameContext;
    state: EngineState;
    timing: GpuTimingService;
    swapView: GPUTextureView;
    target: string;
    group: readonly ContentLayer[];
    view: SlabView;
    groupKey: string;
    alreadyTouched: boolean;
  },
): void {
  const { encoder, ctx, state, timing, swapView, target, group, view, groupKey, alreadyTouched } =
    p;
  const targetView = viewFor(target, ctx, swapView);

  if (strategy === 'merged') {
    // Tile-local: one pass holds the whole group, so OVER blends read coherent
    // dst.color. Production path.
    const pass = encoder.beginRenderPass({
      label: `render-${target}`,
      colorAttachments: [colorAttachment(ctx, target, targetView, alreadyTouched)],
      ...depthAttachment(ctx, target, alreadyTouched, view.slab.reversedZ),
      // Bill the whole group against its per-step group slot — the one honest
      // timing a single-pass shape can give (per-layer slots are the
      // `perLayerTimed` path's alone). A no-op timing service returns undefined,
      // so this spreads to nothing in production merged frames.
      ...timestampSpread(timing, groupKey),
    });
    for (const layer of group) {
      layer.draw(pass, view, ctx, state);
    }
    pass.end();
    return;
  }

  // perLayerTimed: one pass per layer so each carries its own timestampWrites.
  // The M1 OVER-coherency hazard (dst.color stale across pass boundaries — see
  // the module header) is the price of per-pass timing; this path runs only
  // under ?gpuTimings. The first layer of an untouched target carries the
  // clear; the rest load.
  group.forEach((layer, i) => {
    const touchedBefore = alreadyTouched || i > 0;
    const pass = encoder.beginRenderPass({
      label: `render-${target}-${layer.name}`,
      colorAttachments: [colorAttachment(ctx, target, targetView, touchedBefore)],
      ...depthAttachment(ctx, target, touchedBefore, view.slab.reversedZ),
      ...timestampSpread(timing, layer.name),
    });
    layer.draw(pass, view, ctx, state);
    pass.end();
  });
}
