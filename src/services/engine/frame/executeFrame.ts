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
 * A `touched` set, private to one `executeFrame` call, tracks which render
 * targets have been drawn into by THIS program run. The first pass opened
 * against a target uses `loadOp: 'clear'` with that target's clear value;
 * later passes use `'load'`. A render step with a non-empty group marks its
 * target touched; a composite marks its dest touched. Unlike the old split
 * path's dedicated no-draw clear pass, folding the clear into the first
 * enabled layer's pass is safe here because the group is already filtered to
 * enabled layers — a non-empty group always has a first layer to carry the
 * clear. A SEPARATE, frame-wide fact — which targets hold this FRAME's
 * content, for the overlay passes that sample `foreground:0` — lives on
 * `ctx.snapshot.renderedTargets` instead; see that field's own doc for why it
 * is not the same set as `touched`.
 *
 * A capture render step (`step.capture !== undefined`) is the one exception: it
 * names a capture ROW, whose six faces are LAYERS of one texture, but `touched`
 * tracks by target id alone — so it can't distinguish "this face's first pass
 * this run" from "a DIFFERENT face already rendered this run". Capture
 * steps therefore take their first-touch fact from a private
 * `<capture key>:<face>`-keyed set instead, rather than growing `touched` to
 * that granularity. That granularity is load-bearing in BOTH directions: the
 * roster spans two slabs, so the capture line expands to TWO steps per face
 * (COSMO then NEAR0) — a blanket always-clear made the NEAR0 step wipe the
 * COSMO step's galaxy points and textured disks off the face it had just
 * drawn them into.
 *
 * The same `touched` fact drives depth: a render step whose target row declares
 * `depth` (only `foreground:0` today) attaches a depth texture whose load-op is
 * `'clear'` (to this slab's far-plane depth via `depthClearValueFor` — `0.0` under
 * the NEAR0 `foreground:0` row's reversed-Z convention) on first touch and `'load'` after — one
 * first-touch fact, two attachments — so a second render step or a
 * `perLayerTimed` pass reloads the depth already written and inter-layer
 * occlusion is preserved. Composite steps never attach depth (their destination
 * rows are depthless); a capture step attaches its ROW's depth only on a
 * body-slab step — the probe's host body — never on its COSMO/NEAR0 pair.
 */

import type { ExecuteFrameArgs } from '../../../@types/engine/frame/ExecuteFrameArgs';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { GpuTimingService } from '../../../@types/gpu/timing/GpuTimingService';
import type { CaptureFaceRef } from '../../../@types/engine/frame/CaptureFaceRef';
import type { DepthSampleSource } from '../../../@types/engine/frame/DepthSampleSource';
import type { Slab } from '../../../@types/engine/frame/Slab';
import {
  slabViewOf,
  groupKeyOf,
  isBodySlabIndex,
  passTimingSlotName,
  renderStepTimingSlotName,
} from './slabs';
import { computeTimingSlotName } from './timing/computeTimingSlotName';
import { captureFaceAttachment } from './captureFaceAttachment';
import { runBloom } from './runBloom';
import { sampledDepthFor } from './sampledDepthFor';
import { depthClearValueFor } from '../../../utils/gpu/depthClearValueFor';
import { timestampSpread } from '../../../utils/gpu/timestampSpread';

/**
 * Resolve a render-target id to its texture view. The swap-vs-offscreen branch
 * is essential — the swap chain is an acquired view (`args.swapView`), not an
 * allocated texture like the offscreen rows — so it stays confined to this one
 * site: every other id resolves through the render-target table, which throws
 * for ids it never allocated. A capture face has no id here at all — its
 * texture belongs to a capture row (`captureFaceAttachment`).
 *
 * `'swap'` prefers `ctx.output` — a view's own offscreen destination — over
 * the acquired swap-chain view; unset for the main context and every mono
 * view, so this frame's `swap` steps land in the real swap chain exactly as
 * they do today.
 */
function viewFor(id: string, ctx: FrameView, swapView: GPUTextureView): GPUTextureView {
  if (id === 'swap') return ctx.output ?? swapView;
  return ctx.snapshot.renderTargets.viewOf(id);
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
 * A render step's depth load-op. Absent `depth` ⇒ the SAME first-touch
 * `touched` fact that flips the colour load-op: the frame's first pass against
 * a depth target clears, later passes load and so preserve the occlusion
 * already written. A step that declares one overrides that — depth is the only
 * attachment where sharing a target must not imply sharing its contents.
 * `{ sample }` gets none at all, so it neither clears the target's depth nor
 * preserves it — see `sampledDepthFor` for what it gets instead.
 */
function depthLoadOpFor(
  depth: 'clear' | 'load' | DepthSampleSource | undefined,
  touched: boolean,
): GPULoadOp | undefined {
  if (depth === 'clear' || depth === 'load') return depth;
  if (depth === undefined) return touched ? 'load' : 'clear';
  return undefined;
}

/** The depth attachment a step's destination resolved — a target row's or a capture row's. */
function depthAttachment(
  view: GPUTextureView,
  depthLoadOp: GPULoadOp,
  reversedZ: boolean,
): GPURenderPassDepthStencilAttachment {
  return {
    view,
    // Clear to the far-plane depth for THIS slab's convention, single-sourced
    // in depthClearValueFor so the clear and the depthCompare direction can
    // never disagree (a mismatch fights every fragment of the first draw).
    depthClearValue: depthClearValueFor(reversedZ),
    depthLoadOp,
    depthStoreOp: 'store',
  };
}

/** A render step's resolved destination: the shape `renderGroup` draws into, plus its first-touch key. */
type Destination = {
  readonly label: string;
  readonly dest: { readonly view: GPUTextureView; readonly clearValue: GPUColor };
  readonly depth: { readonly view: GPUTextureView; readonly loadOp: GPULoadOp } | undefined;
  readonly touchSet: Set<string>;
  readonly touchKey: string;
};

export function executeFrame(args: ExecuteFrameArgs): void {
  const {
    encoder,
    ctx,
    state,
    program,
    strategy,
    timing,
    swapView,
    captureContexts,
    renderedTargets: frameRendered,
  } = args;

  // Per-`executeFrame` first-touch bookkeeping: a target id enters this set the
  // first time a pass is opened against it THIS PROGRAM RUN, flipping
  // subsequent passes from 'clear' to 'load'. Private to this call — mono's
  // one call spans the whole frame; a future rig whose program for one view
  // splits across several `executeFrame` calls is out of scope here.
  const touched = new Set<string>();
  // Capture steps' own first-touch bookkeeping, keyed `<capture key>:<face>` —
  // see the module header. The key is what keeps two capture rows' face 0
  // apart. Private to this call for the same reason `touched` is.
  const touchedFaces = new Set<string>();
  // The FRAME-WIDE fact `touched` is not: which targets hold THIS FRAME's
  // content, read by five overlay passes as `ctx.snapshot.renderedTargets`
  // (the SAME object as `frameRendered` above, there typed `ReadonlySet`) to
  // decide whether `foreground:0` is sampleable. One object for the whole
  // frame, owned by `renderFrame` and unioned into below by every ordinary
  // render step's group, regardless of which view's program it belongs to —
  // never by a capture step (its row no overlay read or composite ever
  // sources) and never by a composite step (its gate is `touched`, a
  // per-program-run question about ITS OWN view's content, not the frame's).
  // TARGET id → the slab whose depth-clearing step wrote it last this frame.
  // Keyed by target alone, not `(target, slab)`: the depth texture is one
  // buffer per target, so it only ever holds the most recent row's contents
  // regardless of how many slabs share the target — this map mirrors that.
  const lastDepthClear = new Map<string, Slab>();

  for (const step of program) {
    switch (step.kind) {
      case 'compute': {
        // Mirrors `expandFrameOrder`'s `resolve()`: absent names drop rather than
        // throw, so a composition missing the flow Layer still walks a
        // `FRAME_ORDER` that names it (the inverse — a contributed row no line
        // names — is `checkFrameOrder`'s to catch, at boot).
        const compute = state.computes.find((c) => c.name === step.name);
        if (compute === undefined) break;
        // The same one-way DebugPanel override the render rows take below: a
        // toggle hides work the frame would otherwise do, and can never force
        // a dispatch the row's own gate declined. Toggle key and timing slot
        // are ONE string (see `computeTimingSlotName` for why it is suffixed —
        // `'flow'` names both this integrator and the ribbon that draws it).
        const slot = computeTimingSlotName(step.name);
        if (state.settings.debug.disabledPasses[slot] === true) break;
        // The claim is LAZY on purpose: `descriptorFor` marks the slot live for
        // this frame, and these rows carry their own gates (an empty atmosphere
        // draw list, flow switched off) — claiming up front would leave a row
        // reporting the query set's stale ticks from when it last ran.
        compute.encode(encoder, ctx, state, () => timestampSpread(timing, slot));
        break;
      }
      case 'render': {
        // The runtime hand-off: a step carrying `capture` resolves EVERY
        // per-step value below — slab view, enable gate, draw ctx — from ITS
        // OWN camera (`scheduleCubemapCaptures`'s per-face derivation), not
        // the frame-wide `ctx`. A missing map entry — that row's bake was
        // skipped, e.g. a pre-bootstrap frame — skips the step cleanly, the
        // same outcome an empty group already produces below. For every
        // ordinary step `step.capture` is undefined and `stepCtx` is just
        // `ctx` — a no-op passthrough.
        const stepCtx =
          step.capture === undefined
            ? ctx
            : captureContexts?.get(step.capture.key)?.get(step.capture.face)?.ctx;
        if (stepCtx === undefined) break;
        // The DebugPanel renderer-toggle override is one-way: it hides a pass
        // whose own `enabled()` gate returned true, and can never force-enable
        // one whose gate returned false — hence the check follows the gate.
        // Empty in production, so the membership lookup is in the noise.
        const disabledPasses = state.settings.debug.disabledPasses;
        // The frame's ONLY slab resolution — one SlabView per render step,
        // threaded into every pass in the group. Resolved BEFORE the gate: a
        // body-row pass's `enabled` reads `view.slab.frame.bodyId` off it, and
        // a `{ sample }` step's `sampledDepth` must be on `view` before the
        // gate too — `contactShadowsPass.enabled` reads it to tell "my row"
        // from some other row sampling the same texture. Capture rosters
        // carry no sample marker (`bodyRowSteps`'s module header), so a
        // capture step never takes this branch.
        const slab = slabViewOf(stepCtx, step.slab);
        const view: SlabView =
          step.capture === undefined && typeof step.depth === 'object'
            ? {
                ...slab,
                sampledDepth: sampledDepthFor(
                  step.depth.sample,
                  lastDepthClear,
                  ctx.snapshot.renderTargets,
                ),
              }
            : slab;
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
        // capture step names a capture ROW, which owns the texture its faces
        // are layers of and takes its first touch per FACE rather than from
        // `touched`, and never unions into `frameRendered` — no overlay read
        // or composite ever names a capture row's `<key>:<face>` touch key.
        let destination: Destination;
        if (step.capture === undefined) {
          // A split row's `'clear'` segment is skipped when its group is empty
          // (a body with no terrain): its `'load'` must not inherit the
          // previous row's depth. Its `{ sample }` segment has no such guard
          // any more — an empty source row reads the far placeholder via
          // `sampledDepthFor` above, same as a source no row has cleared yet.
          const rowCleared = lastDepthClear.get(step.target) === view.slab;
          const depth = step.depth === 'load' && !rowCleared ? 'clear' : step.depth;
          const spec = ctx.snapshot.renderTargets.specOf(step.target);
          const loadOp = depthLoadOpFor(depth, touched.has(step.target));
          if (loadOp === 'clear') lastDepthClear.set(step.target, view.slab);
          destination = {
            label: step.target,
            dest: { view: viewFor(step.target, ctx, swapView), clearValue: spec.clearValue },
            depth:
              spec.depth && loadOp !== undefined
                ? { view: ctx.snapshot.renderTargets.depthViewOf(step.target), loadOp }
                : undefined,
            touchSet: touched,
            touchKey: step.target,
          };
        } else {
          const face = captureFaceAttachment(step.capture, ctx, state);
          const touchKey = `${step.capture.key}:${step.capture.face}`;
          const loadOp = depthLoadOpFor(step.depth, touchedFaces.has(touchKey));
          destination = {
            label: step.capture.key,
            dest: face,
            // The row's depth is for its body-slab steps alone: the COSMO/NEAR0
            // pair draws the depthless sky the body then stands in front of.
            depth:
              face.depthView !== null && isBodySlabIndex(step.slab) && loadOp !== undefined
                ? { view: face.depthView, loadOp }
                : undefined,
            touchSet: touchedFaces,
            touchKey,
          };
        }
        renderGroup(strategy, {
          encoder,
          ctx: stepCtx,
          state,
          timing,
          label: destination.label,
          dest: destination.dest,
          depth: destination.depth,
          capture: step.capture,
          group,
          view,
          groupKey,
          alreadyTouched: destination.touchSet.has(destination.touchKey),
        });
        destination.touchSet.add(destination.touchKey);
        // Frame-wide content fact: only an ordinary (non-capture) target — a
        // capture row's touch key is `<key>:<face>`, which no overlay read or
        // composite ever names (see the comment above `destination`'s branch).
        if (step.capture === undefined) frameRendered.add(destination.touchKey);
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
              ctx.snapshot.renderTargets.specOf(dest).clearValue,
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
        const dstFormat = ctx.snapshot.renderTargets.specOf(dest).format;
        compositor.draw(pass, viewFor(source, ctx, swapView), blend, tone, dstFormat);
        pass.end();
        touched.add(dest);
        break;
      }
      case 'copy': {
        // Skip unless the source was drawn into this frame — same gate as
        // 'composite'.
        if (!touched.has(step.source)) break;
        // A copy writes THIS view's own output (a dome face's `dome-cube`
        // layer) and has no other destination — a missing `ctx.output` is a
        // wiring bug, not a frame-skippable condition.
        if (ctx.output === undefined) {
          throw new Error('executeFrame: copy step has no view output');
        }
        const pass = encoder.beginRenderPass({
          label: `copy-${step.source}`,
          colorAttachments: [
            {
              view: ctx.output,
              loadOp: 'clear',
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              storeOp: 'store',
            },
          ],
        });
        const compositor = state.gpu.compositor;
        if (!compositor) {
          throw new Error('executeFrame: compositor missing for copy step');
        }
        const dstFormat = ctx.snapshot.renderTargets.specOf(step.source).format;
        compositor.draw(pass, viewFor(step.source, ctx, swapView), 'replace', null, dstFormat);
        pass.end();
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
    ctx: FrameView;
    state: EngineState;
    timing: GpuTimingService;
    /** Pass-label stem — the destination's own name (target id or capture key). */
    label: string;
    /** Where this step's passes write, already resolved. */
    dest: { readonly view: GPUTextureView; readonly clearValue: GPUColor };
    /** The destination's depth view and its load-op; absent for a depthless destination. */
    depth?: { readonly view: GPUTextureView; readonly loadOp: GPULoadOp };
    /** The face this step writes, when it is a capture step — it keys the slot names. */
    capture?: CaptureFaceRef;
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
    capture,
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
      ...(depth
        ? { depthStencilAttachment: depthAttachment(depth.view, depth.loadOp, view.slab.reversedZ) }
        : {}),
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
    const slot = passTimingSlotName(contentPass.name, view.slab.index, capture);
    const pass = encoder.beginRenderPass({
      label: `render-${label}-${slot}`,
      colorAttachments: [colorAttachment(dest.view, dest.clearValue, touchedBefore)],
      ...(depth
        ? {
            depthStencilAttachment: depthAttachment(
              depth.view,
              i === 0 ? depth.loadOp : 'load',
              view.slab.reversedZ,
            ),
          }
        : {}),
      ...timestampSpread(timing, slot),
    });
    contentPass.draw(pass, view, ctx, state);
    pass.end();
  });
}
