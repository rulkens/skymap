/**
 * executeFrame — the single imperative site that walks one `FrameStep[]`
 * program into one GPU command encoder. This is the heart of the renderer
 * unification: pre-unification the frame's order lived as an implicit call
 * chain spread across `renderFrame` and a hand-wired HDR-encode + tone-map +
 * UI-overlay sequence. `FRAME_ORDER` holds that order as data; this executor is
 * the one loop that consumes its expansion.
 *
 * ### The step-kind switch is the frame's only switch
 *
 * A render step arrives carrying the passes it draws, so nothing here selects:
 * the executor opens one pass and draws that list, gated only by each pass's own
 * `enabled` and the DebugPanel override. There are no pass-identity branches, no
 * per-pass slab lookups (exactly one `slabViewOf` per render step), and no
 * membership-implies-blend logic. Adding a near-field slab or a new composite is
 * a new *line* in `FRAME_ORDER`, not a new code path here.
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
 * A capture render step (`step.capture !== undefined`) is the one exception: it
 * names a capture ROW, whose six faces are LAYERS of one texture, but `touched`
 * tracks by target id alone — so it can't distinguish "this face's first pass
 * this frame" from "a DIFFERENT face already rendered this frame". Capture
 * steps therefore take their first-touch fact from a private
 * `<capture key>:<face>`-keyed set instead, rather than growing the public
 * `renderedTargets` surface to that granularity. That granularity is
 * load-bearing in BOTH directions: the roster spans two slabs, so the
 * capture line expands to TWO steps per face (COSMO then NEAR0) — a
 * blanket always-clear made the NEAR0 step wipe the COSMO step's galaxy
 * points and textured disks off the face it had just drawn them into.
 *
 * The same `touched` fact drives depth: a render step whose target row declares
 * `depth` (only `foreground:0` today) attaches a depth texture whose load-op is
 * `'clear'` (to this slab's far-plane depth via `depthClearValueFor` — `0.0` under
 * the NEAR0 `foreground:0` row's reversed-Z convention) on first touch and `'load'` after — one
 * first-touch fact, two attachments — so a second render step or a
 * `perLayerTimed` pass reloads the depth already written and inter-layer
 * occlusion is preserved. Composite and capture steps never attach depth (their
 * destination rows are depthless).
 */

import type { ExecuteFrameArgs } from '../../../@types/engine/frame/ExecuteFrameArgs';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { GpuTimingService } from '../../../@types/gpu/timing/GpuTimingService';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import { slabViewOf, groupKeyOf, passTimingSlotName, renderStepTimingSlotName } from './slabs';
import { captureFaceAttachment } from './captureFaceAttachment';
import { encodeFlowCompute } from './encodeFlowCompute';
import { encodeAtmosphereSkyView } from './encodeAtmosphereSkyView';
import { encodeAtmosphereFroxel } from './encodeAtmosphereFroxel';
import { runBloom } from './runBloom';
import { depthClearValueFor } from '../../../utils/gpu/depthClearValueFor';

/**
 * COMPUTE — the name→fn table a `'compute'` step dispatches through; a new
 * compute pre-pass is a new row, not a new branch. Every row takes the uniform
 * `(encoder, ctx, state)` shape — `flow` reads `ctx.nowMs` as its real-time
 * advection clock, while the two atmosphere bakes read the rendered pose off it
 * so what they bake matches what the shell fragment samples.
 */
const COMPUTE: Record<
  string,
  (encoder: GPUCommandEncoder, ctx: ReadyFrameContext, state: EngineState) => void
> = {
  flow: (encoder, ctx, state) => encodeFlowCompute(encoder, state, ctx.nowMs),
  atmosphereSkyView: (encoder, ctx, state) => encodeAtmosphereSkyView(encoder, ctx, state),
  atmosphereFroxel: (encoder, ctx, state) => encodeAtmosphereFroxel(encoder, ctx, state),
};

/**
 * Resolve a render-target id to its texture view. The swap-vs-offscreen branch
 * is essential — the swap chain is an acquired view (`args.swapView`), not an
 * allocated texture like the offscreen rows — so it stays confined to this one
 * site: every other id resolves through the render-target table, which throws
 * for ids it never allocated. A capture face has no id here at all — its
 * texture belongs to a capture row (`captureFaceAttachment`).
 */
function viewFor(id: string, ctx: ReadyFrameContext, swapView: GPUTextureView): GPUTextureView {
  if (id === 'swap') return swapView;
  return ctx.renderTargets.viewOf(id);
}

/** Build a colour attachment that clears (first touch) or loads (later). */
function colorAttachment(
  view: GPUTextureView,
  clearValue: GPUColor,
  touched: boolean,
): GPURenderPassColorAttachment {
  if (touched) return { view, loadOp: 'load', storeOp: 'store' };
  return { view, loadOp: 'clear', clearValue, storeOp: 'store' };
}

/**
 * A render step's depth target and load-op. Absent `depth` ⇒ the SAME
 * first-touch `touched` fact that flips the colour load-op: the frame's first
 * pass against a depth target clears, later passes load and so preserve the
 * occlusion already written. A step that declares one overrides that — depth is
 * the only attachment where sharing a target must not imply sharing its
 * contents. `'sample'` gets none at all, so it neither clears the target's
 * depth nor preserves it — never make it a target's first.
 */
function depthFor(
  target: string,
  depth: 'clear' | 'load' | 'sample' | undefined,
  touched: boolean,
): { readonly target: string; readonly loadOp: GPULoadOp } | undefined {
  if (depth === 'sample') return undefined;
  if (depth === 'clear' || depth === 'load') return { target, loadOp: depth };
  return { target, loadOp: touched ? 'load' : 'clear' };
}

/**
 * Depth attachment for a target row that declares `depth`, spread into the
 * pass descriptor — `{}` (no key) for depthless rows. Composite and capture
 * steps never call this — their destination rows are depthless — so the depth
 * budget is confined to the opaque render passes that own it.
 *
 * `specOf` throws for an unknown target, but that's unreachable here: resolving
 * the step's destination throws first, before `renderGroup` is called.
 */
function depthAttachment(
  ctx: ReadyFrameContext,
  target: string,
  depthLoadOp: GPULoadOp,
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
      depthLoadOp,
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
  const { encoder, ctx, state, program, strategy, timing, swapView, captureContexts } = args;

  // Per-`executeFrame` first-touch bookkeeping: a target id enters this set the
  // first time a pass is opened against it, flipping subsequent passes from
  // 'clear' to 'load'. This is the SAME object exposed on the ready context as
  // `renderedTargets`: the public type is `ReadonlySet` (the consumer surface),
  // but the concrete object `deriveFrameContext` builds is a real `Set`, so the
  // executor populates it here and later layers read which targets rendered this
  // frame via `ctx.renderedTargets`.
  const touched = ctx.renderedTargets as Set<string>;
  // Capture steps' own first-touch bookkeeping, keyed `<capture key>:<face>` —
  // see the module header. The key is what keeps two capture rows' face 0
  // apart. Private to this call because `renderedTargets` is a public consumer
  // surface keyed by bare target id.
  const touchedFaces = new Set<string>();

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
        // The runtime hand-off: a step carrying `capture` resolves EVERY
        // per-step value below — slab view, enable gate, draw ctx — from ITS
        // OWN camera (`scheduleCubemapCaptures`'s per-face derivation), not
        // the frame-wide `ctx`. A missing map entry (that face's
        // `cubemapFaceContext` returned null — e.g. a pre-bootstrap frame)
        // skips the step cleanly, the same outcome an empty group already
        // produces below. For every ordinary step `step.capture` is undefined and
        // `stepCtx` is just `ctx` — a no-op passthrough.
        const stepCtx =
          step.capture === undefined
            ? ctx
            : captureContexts?.get(step.capture.key)?.get(step.capture.face);
        if (stepCtx === undefined) break;
        // The DebugPanel renderer-toggle override is one-way: it hides a pass
        // whose own `enabled()` gate returned true, and can never force-enable
        // one whose gate returned false — hence the check follows the gate.
        // Empty in production, so the membership lookup is in the noise.
        const disabledPasses = state.settings.debug.disabledPasses;
        // The frame's ONLY slab resolution — one SlabView per render step,
        // threaded into every pass in the group. Resolved BEFORE the gate: a
        // body-row pass's `enabled` reads `view.slab.frame.bodyId` off it.
        const view = slabViewOf(stepCtx, step.slab);
        const group = step.passes.filter(
          (l) => l.enabled(state, stepCtx, view) && disabledPasses[l.name] !== true,
        );
        if (group.length === 0) break;
        // The merged pass bills its whole group against this one slot. The key
        // comes from the shared `groupKeyOf` helper (slabs.ts) — the same
        // definition `timedSlotRowsOf` allocates the slot under — so
        // `descriptorFor(groupKey)` resolves exactly that slot.
        // `renderStepTimingSlotName` appends the capture face when present — a
        // capture's 6 faces all share one `(row, NEAR0)` group, so the bare
        // groupKey would look up the SAME slot for all 6 (see its doc,
        // slabs.ts). The authored `slot` separates the several `FRAME_ORDER`
        // lines sharing `(hdr, NEAR0)` the same way; for a line with neither
        // this is a no-op passthrough of `groupKey`.
        const groupKey = renderStepTimingSlotName(groupKeyOf(step), step.capture?.face, step.slot);
        // The destination, resolved once — the executor's only branch on what a
        // step writes into. An ordinary step names a render-target row; a
        // capture step names a capture ROW, which owns the texture its faces are
        // layers of, is depthless, and takes its first touch per FACE rather
        // than from `touched` (the object layers read as `ctx.renderedTargets`).
        // Leaving capture rows out of that set is unobservable: every read of it
        // guards on `'foreground:0'`, and no composite sources a capture row.
        const destination =
          step.capture === undefined
            ? {
                label: step.target,
                dest: {
                  view: viewFor(step.target, ctx, swapView),
                  clearValue: ctx.renderTargets.specOf(step.target).clearValue,
                },
                depth: depthFor(step.target, step.depth, touched.has(step.target)),
                touchSet: touched,
                touchKey: step.target,
              }
            : {
                label: step.capture.key,
                dest: captureFaceAttachment(step.capture, ctx.renderTargets),
                depth: undefined,
                touchSet: touchedFaces,
                touchKey: `${step.capture.key}:${step.capture.face}`,
              };
        renderGroup(strategy, {
          encoder,
          ctx: stepCtx,
          state,
          timing,
          label: destination.label,
          dest: destination.dest,
          depth: destination.depth,
          face: step.capture?.face,
          group,
          view,
          groupKey,
          alreadyTouched: destination.touchSet.has(destination.touchKey),
        });
        destination.touchSet.add(destination.touchKey);
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
            colorAttachment(
              viewFor(dest, ctx, swapView),
              ctx.renderTargets.specOf(dest).clearValue,
              touched.has(dest),
            ),
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
    /** Pass-label stem — the destination's own name (target id or capture key). */
    label: string;
    /** Where this step's passes write, already resolved. */
    dest: { readonly view: GPUTextureView; readonly clearValue: GPUColor };
    /** The depth-bearing target and its load-op; absent for a depthless destination. */
    depth?: { readonly target: string; readonly loadOp: GPULoadOp };
    face?: CubeFace;
    group: readonly ContentPass[];
    view: SlabView;
    groupKey: string;
    alreadyTouched: boolean;
  },
): void {
  const {
    encoder,
    ctx,
    state,
    timing,
    label,
    dest,
    depth,
    face,
    group,
    view,
    groupKey,
    alreadyTouched,
  } = p;

  if (strategy === 'merged') {
    // Tile-local: one pass holds the whole group, so OVER blends read coherent
    // dst.color. Production path.
    const pass = encoder.beginRenderPass({
      label: `render-${label}`,
      colorAttachments: [colorAttachment(dest.view, dest.clearValue, alreadyTouched)],
      ...(depth ? depthAttachment(ctx, depth.target, depth.loadOp, view.slab.reversedZ) : {}),
      // Bill the whole group against its per-step group slot — the one honest
      // timing a single-pass shape can give (per-layer slots are the
      // `perLayerTimed` path's alone). A no-op timing service returns undefined,
      // so this spreads to nothing in production merged frames.
      ...timestampSpread(timing, groupKey),
    });
    for (const contentPass of group) {
      contentPass.draw(pass, view, ctx, state);
    }
    pass.end();
    return;
  }

  // perLayerTimed: one pass per layer so each carries its own timestampWrites.
  // The M1 OVER-coherency hazard (dst.color stale across pass boundaries — see
  // the module header) is the price of per-pass timing; this path runs only
  // under ?gpuTimings. The step's clear (colour or depth) belongs to the FIRST
  // layer's pass only — the rest load, or each would wipe its predecessor.
  // `passTimingSlotName` keys the slot by `view.slab.index` (not just
  // `contentPass.name`): a `slab: 'body'` layer draws once per body row in one
  // encoder, and without the row in the name every row's pass would attach
  // the SAME two query indices — the last one to run silently overwrites the
  // others' timestamps (see `passTimingSlotName`'s doc, slabs.ts).
  group.forEach((contentPass, i) => {
    const touchedBefore = alreadyTouched || i > 0;
    const slot = passTimingSlotName(contentPass.name, view.slab.index, face);
    const pass = encoder.beginRenderPass({
      label: `render-${label}-${slot}`,
      colorAttachments: [colorAttachment(dest.view, dest.clearValue, touchedBefore)],
      ...(depth
        ? depthAttachment(ctx, depth.target, i === 0 ? depth.loadOp : 'load', view.slab.reversedZ)
        : {}),
      ...timestampSpread(timing, slot),
    });
    contentPass.draw(pass, view, ctx, state);
    pass.end();
  });
}
