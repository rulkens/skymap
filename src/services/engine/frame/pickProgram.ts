/**
 * pickProgram — the parallel per-slab pick program over the content-layer
 * registry.
 *
 * ### Why pick is NOT a FRAME member
 *
 * The visual FRAME is a linear `FrameStep[]` the executor walks once per
 * animation tick (`frameOrder.ts` / `executeFrame.ts`). Pick is deliberately
 * NOT one of those steps: it is a demand-driven query (hover / click), it
 * produces a value rather than swap-chain pixels, and it runs on its OWN
 * command encoder + `queue.submit` at a cadence set by pointer events, not the
 * render loop. Folding it into the FRAME would braid "which galaxy is under the
 * cursor?" into "draw the next frame" — two concerns that vary independently.
 * So this program is a sibling of the FRAME executor: it shares the same
 * `ContentPass` registry and the same frame order (for a pass's slab, via
 * `passSlabOf`), filters by `drawPick` presence + the pick gate
 * `(pickEnabled ?? enabled)` — a pass's own pick gate wherever its pick set
 * differs from its draw set, else `enabled` (see `ContentPass.pickEnabled`) —
 * groups the survivors by slab, and re-rasterises each slab's pickable geometry
 * through the r32uint pick pipeline into its own pick target. See the
 * renderer-unification design's "Pick" section.
 *
 * ### Why the resolve is texel reads + a CPU fold, not a GPU composite
 *
 * The screen composites slabs far-to-near with OVER blending, so what the
 * cursor lands on is whatever the NEAREST slab drew there. The naive mirror
 * would be a second GPU pass compositing every slab's pick texture into one —
 * but a pick only ever inspects a SINGLE texel (the pixel under the cursor).
 * Reading one texel per slab back to the CPU and folding them near→far with
 * `frontmostPick` reproduces the exact occlusion result for a handful of bytes,
 * with no extra pipeline, no blend state to keep in sync with the visual
 * composite, and no whole-texture round-trip. The GPU work stays "draw the pick
 * ids"; the cross-slab occlusion rule lives in one pure CPU fold.
 *
 * ### One 1×1 target for every slab, through the cursor's window
 *
 * `pick()` hands each slab's draws `windowedSlabView`, the slab's projection
 * cropped to the cursor's pixel, so every slab rasterises into ONE shared 1×1
 * r32uint colour texture plus one 1×1 depth texture per format (COSMO's
 * depth24plus, everyone else's depth32float). Each pass's texel is copied to
 * that slab's staging buffer before the next pass clears it — one encoder
 * executes in recorded order, so the reuse is safe. The pick gates run on the
 * whole-canvas view first: the window changes what is rasterised, never what
 * is pickable. `renderForDebug()` needs every slab's FULL raster alive at once,
 * so it keeps its own canvas-sized target per slab in `debugTargets`, reused
 * across calls and evicted once a slab stops appearing.
 *
 * @module
 */

import type { PickProgram } from '../../../@types/engine/frame/PickProgram';
import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { PickWindow } from '../../../@types/engine/frame/PickWindow';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { PickResult } from '../../../@types/data/PickResult';
import { pickFrameContext } from '../helpers/pickFrameContext';
import { slabViewOf, foregroundChainOrder, isBodySlabIndex, COSMO, NEAR0 } from './slabs';
import { passSlabOf } from './passSlabOf';
import { windowedSlabView } from './windowedSlabView';
import { OVERLAY_PICK_SLAB } from './overlayPickSlab';
import { FRAME_ORDER } from './frameOrder';
import { frontmostPick } from '../../../utils/picking/frontmostPick';
import { depthClearValueFor } from '../../../utils/gpu/depthClearValueFor';
import { unpackPick } from '../../../data/selectionEncoding';

// The r32uint pick texture is written by the pass and read back a texel at a
// time; the depth attachment resolves overlapping billboards so the front-most
// wins (matching visual occlusion). Any pipeline drawing into a slab's pick
// pass must declare the matching depthStencil format: the points / ring / disk
// picks declare depth24plus (COSMO), the Milky-Way pick declares depth32float
// (NEAR0 — see milkyWayPickRenderer).
// Which slab a pass rasterises through, read off the frame order once — the
// pick pass must use the SAME projection the visual draw does, or a click
// tests geometry the screen never showed at that depth.
const PASS_SLABS = passSlabOf(FRAME_ORDER);

const COSMO_DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';
const NEAR0_DEPTH_FORMAT: GPUTextureFormat = 'depth32float';

/** Human-readable `RenderTargetSpec.id` for a slab's pick target. */
function pickTargetId(slabIndex: number): string {
  if (slabIndex === OVERLAY_PICK_SLAB) return 'pick:overlay';
  return slabIndex === COSMO ? 'pick:cosmo' : 'pick:near0';
}

/**
 * Depth format for a slab's pick target — see the format constants above.
 * Exported because every pipeline drawing into that slab's pick pass must
 * declare the SAME format, so the target and its pipelines read one source
 * (`gpuHandleRegistry` sizes the label pick pipelines from it). The overlay
 * lands on the NEAR0 branch by construction: its one occupant is the NEAR0
 * caption stamp, whose pipeline is built from `pickDepthFormat(NEAR0)`.
 */
export function pickDepthFormat(slabIndex: number): GPUTextureFormat {
  return slabIndex === COSMO ? COSMO_DEPTH_FORMAT : NEAR0_DEPTH_FORMAT;
}

// One pass's attachments: the r32uint colour texture and its depth. `width` /
// `height` let a debug target be reused while the canvas size holds and
// reallocated on resize; `pick()`'s shared pair is always 1×1.
type PickSlabTarget = {
  pickTexture: GPUTexture;
  depthTexture: GPUTexture;
  width: number;
  height: number;
};

/**
 * Construct the pick program bound to `device` + `canvas`, driven by the
 * shared `state` and the content-layer registry `passes`. This is the single
 * owner of the hover / click / debug-overlay pick path.
 */
export function createPickProgram(deps: {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  state: EngineState;
  passes: readonly ContentPass[];
}): PickProgram {
  const { device, canvas, state, passes } = deps;

  // `pick()`'s shared attachments: one colour texture, one depth per format.
  let sharedColour: GPUTexture | null = null;
  const sharedDepth = new Map<GPUTextureFormat, GPUTexture>();
  // Staging buffers are size-invariant (256 bytes, one texel) and keyed per
  // slab index, so each slab's texel survives the next pass's clear.
  const slabStaging = new Map<number, GPUBuffer>();
  // `renderForDebug`'s per-slab targets — reused across calls, evicted when a
  // call doesn't touch them (see module header).
  const debugTargets = new Map<number, PickSlabTarget>();

  // `mapAsync` is async; a second pick before the first resolves would map an
  // already-mapped staging buffer (validation error). `inFlight` makes the
  // second call bail with null. `renderForDebug` does NOT consult it — it
  // never touches the staging buffers, and sharing the guard would make the
  // debug overlay flicker whenever a hover-pick was mid-flight.
  let inFlight = false;

  // `destroy()` can race an in-flight `mapAsync`; the buffer teardown rejects
  // the pending map with `AbortError`. We swallow that specific abort silently
  // (harmless teardown race) and re-throw anything else.
  let destroyed = false;

  /** Allocate one `PickSlabTarget` (r32uint colour + the given depth format). */
  function createPickTarget(
    label: string,
    w: number,
    h: number,
    depthFormat: GPUTextureFormat,
  ): PickSlabTarget {
    return {
      pickTexture: device.createTexture({
        label: `${label}-target`,
        size: { width: w, height: h },
        format: 'r32uint',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.TEXTURE_BINDING,
      }),
      depthTexture: device.createTexture({
        label: `${label}-depth`,
        size: { width: w, height: h },
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      }),
      width: w,
      height: h,
    };
  }

  /** `pick()`'s shared attachments for a slab: 1×1, the cursor window's size. */
  function ensureSharedTarget(slabIndex: number): PickSlabTarget {
    sharedColour ??= device.createTexture({
      label: 'pick-target',
      size: { width: 1, height: 1 },
      format: 'r32uint',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const depthFormat = pickDepthFormat(slabIndex);
    let depth = sharedDepth.get(depthFormat);
    if (!depth) {
      depth = device.createTexture({
        label: `pick-depth-${depthFormat}`,
        size: { width: 1, height: 1 },
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      sharedDepth.set(depthFormat, depth);
    }
    return { pickTexture: sharedColour, depthTexture: depth, width: 1, height: 1 };
  }

  /** `slabIndex`'s debug target, reused when the viewport size still matches. */
  function ensureDebugTarget(slabIndex: number, w: number, h: number): PickSlabTarget {
    const existing = debugTargets.get(slabIndex);
    if (existing && existing.width === w && existing.height === h) return existing;

    existing?.pickTexture.destroy();
    existing?.depthTexture.destroy();

    const label = isBodySlabIndex(slabIndex)
      ? `pick:body[${slabIndex}]-debug`
      : pickTargetId(slabIndex);
    const target = createPickTarget(label, w, h, pickDepthFormat(slabIndex));
    debugTargets.set(slabIndex, target);
    return target;
  }

  /** Destroy + drop every debug target NOT in `touched` (see module header). */
  function evictStaleDebugTargets(touched: ReadonlySet<number>): void {
    for (const [slabIndex, target] of debugTargets) {
      if (touched.has(slabIndex)) continue;
      target.pickTexture.destroy();
      target.depthTexture.destroy();
      debugTargets.delete(slabIndex);
    }
  }

  /**
   * The MAP_READ staging buffer for a slab's cursor-texel readback.
   * `copyTextureToBuffer` requires `bytesPerRow` a multiple of 256, so the
   * buffer is 256 bytes even though only 4 are read.
   */
  function ensureSlabStaging(slabIndex: number): GPUBuffer {
    let staging = slabStaging.get(slabIndex);
    if (!staging) {
      staging = device.createBuffer({
        label: `pick-program-staging-${pickTargetId(slabIndex)}`,
        size: 256,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      slabStaging.set(slabIndex, staging);
    }
    return staging;
  }

  /**
   * Begin a slab's pick pass, invoke every pickable layer's `drawPick` in
   * registry order, and end it. The pass clears the colour target to the
   * `0` no-hit sentinel and the depth to `1`. `timing` is threaded only for
   * the cosmological slab (the single `'pick'` timing slot).
   */
  function recordSlabPass(
    encoder: GPUCommandEncoder,
    slabIndex: number,
    target: PickSlabTarget,
    view: SlabView,
    ctx: FrameView,
    slabPickables: readonly ContentPass[],
    timing: GPURenderPassTimestampWrites | undefined,
  ): void {
    const pass = encoder.beginRenderPass({
      label: `${pickTargetId(slabIndex)}-pass`,
      colorAttachments: [
        {
          view: target.pickTexture.createView(),
          // 0 = the "no hit" sentinel (every real id is +1-offset).
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: target.depthTexture.createView(),
        // Clear to the far-plane depth for THIS slab's convention, single-sourced
        // in depthClearValueFor so the clear and the depthCompare direction can
        // never disagree (a mismatch fights every fragment of the first draw).
        depthClearValue: depthClearValueFor(view.slab.reversedZ),
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
      // Spread-omit so the key never lands as `undefined` (validation noise
      // varies by implementation).
      ...(timing ? { timestampWrites: timing } : {}),
    });

    for (const contentPass of slabPickables) {
      contentPass.drawPick!(pass, view, ctx, state);
    }

    pass.end();
  }

  // Pickable layers grouped by slab, in the near→far order `frontmostPick`
  // needs, behind the overlay group: an overlay row's pixels composite after
  // the whole slab chain (`ContentPass.pickTarget`), so its stamp reads first —
  // a rank no distance key can carry, the caption's subject and the disc it
  // covers being different rows. Reuses `foregroundChainOrder`'s ordering (the key the
  // colour chain already sorts NEAR0 + body rows by, slabs.ts — including its
  // unknown-far rule for a NEAR0 that resolved no sphere, which this path
  // relies on: the star catalog and MW impostor are pickable without one)
  // reversed to near→far, with COSMO forced last — it never enters that chain, and its
  // fixed 10 kpc–50 Gpc bracket is always farther than any near-field/body
  // content. Fixes the regression where a raw numeric-ascending slab-index
  // sort let any NEAR0(0) star hit beat a genuinely nearer body/planet hit,
  // and even let COSMO(1) beat a body row(2+).
  function pickablesBySlab(
    ctx: FrameView,
  ): { slabIndex: number; view: SlabView; passes: ContentPass[] }[] {
    // A pass with no FRAME_ORDER line draws nowhere, so it picks nowhere —
    // `checkFrameOrder` is what makes that unreachable for a real registry.
    // An overlay row skips that derivation: its stamp composites ahead of every
    // slab, so which slab it draws through tells you nothing about where it picks.
    const candidates = passes.flatMap((pass) => {
      if (!pass.drawPick || pass.pickTarget !== undefined) return [];
      const slab = PASS_SLABS.get(pass.name);
      return slab === undefined ? [] : [{ pass, slab }];
    });
    const overlayCandidates = passes.filter(
      (pass) => pass.drawPick && pass.pickTarget === 'overlay',
    );
    // Every body-row slab index present this frame — a body-roster pass's
    // `drawPick` (`earthPass`, `planetsPass`) contributes to each one, the
    // same widening `executeFrame` applies. `ctx.slabs` holds full `Slab`s, so this
    // reads `frame.kind` directly (the index-only sibling, `isBodySlabIndex`
    // in slabs.ts, is for the one call site with no `Slab` in hand).
    const bodySlabIndices = ctx.slabs
      .filter((slab) => slab.frame.kind === 'body-m')
      .map((slab) => slab.index);
    const numericSlabs = candidates.filter((c) => c.slab !== 'body').map((c) => c.slab as number);
    const hasBodyCandidate = candidates.some((c) => c.slab === 'body');
    const candidateSlabs = new Set(
      hasBodyCandidate ? [...numericSlabs, ...bodySlabIndices] : numericSlabs,
    );
    const nearToFar = [...foregroundChainOrder(ctx.slabs)]
      .reverse()
      .filter((index) => candidateSlabs.has(index));
    const slabIndices = candidateSlabs.has(COSMO) ? [...nearToFar, COSMO] : nearToFar;
    // Filter by the PICK gate: `pickEnabled` when a pass declares one (its
    // pick set differs from its draw set — planetsPass's flat ∪ textured,
    // the caption stamps, the Milky Way's narrower close-range gate), else
    // `enabled` (pick set == draw set, the common case). See
    // `ContentPass.pickEnabled`.
    const pickGated = (pass: ContentPass, view: SlabView): boolean =>
      (pass.pickEnabled ?? pass.enabled)(state, ctx, view);
    // The overlay group borrows NEAR0's view for its depth clear (the
    // convention its pipelines are built from), never its vp — an overlay
    // stamp is screen-space geometry.
    const overlayView = slabViewOf(ctx, NEAR0);
    const overlayGroup = {
      slabIndex: OVERLAY_PICK_SLAB,
      view: overlayView,
      passes: overlayCandidates.filter((pass) => pickGated(pass, overlayView)),
    };
    const slabGroups = slabIndices.map((slabIndex) => {
      const view = slabViewOf(ctx, slabIndex);
      const slabPasses = candidates
        .filter(
          (c) =>
            (c.slab === slabIndex || (c.slab === 'body' && bodySlabIndices.includes(slabIndex))) &&
            pickGated(c.pass, view),
        )
        .map((c) => c.pass);
      return { slabIndex, view, passes: slabPasses };
    });
    return [overlayGroup, ...slabGroups].filter((group) => group.passes.length > 0);
  }

  async function pick(pickXPx: number, pickYPx: number): Promise<PickResult | null> {
    if (inFlight) return null;

    const ctx = pickFrameContext(state, canvas);
    if (ctx === null) return null;

    const groups = pickablesBySlab(ctx);
    if (groups.length === 0) return null; // no pickable layer → no GPU work

    const canvasPx: Vec2 = [canvas.width, canvas.height];
    // Clamp so the window stays inside the canvas (DPR-scaled CSS coords can
    // land out of range during a resize).
    const cursorWindow: PickWindow = {
      originPx: [
        Math.max(0, Math.min(canvasPx[0] - 1, Math.floor(pickXPx))),
        Math.max(0, Math.min(canvasPx[1] - 1, Math.floor(pickYPx))),
      ],
      sizePx: [1, 1],
    };

    const encoder = device.createCommandEncoder({ label: 'pick-program-encoder' });
    // One submit can now span MULTIPLE passes (one per body-m slab row plus
    // NEAR0), so `bodyPickRenderer`'s slot cursors must reset ONCE here, before
    // any pass is recorded — never per pass (see its module header's
    // writeBuffer-vs-submit note).
    state.gpu.bodyPickRenderer?.beginSubmit();

    // Record every slab's pass + texel copy on ONE encoder; the staging
    // buffers are collected in slab order (near→far) so the readback fold is a
    // simple "first non-zero". Windowing comes after `pickablesBySlab` has
    // gated on the whole-canvas view.
    const stagingInOrder: GPUBuffer[] = [];
    for (const { slabIndex, view, passes: slabPickables } of groups) {
      const target = ensureSharedTarget(slabIndex);
      const staging = ensureSlabStaging(slabIndex);
      const timing =
        slabIndex === COSMO ? state.gpu.timingService.descriptorFor('pick') : undefined;
      const windowed = windowedSlabView(view, cursorWindow, canvasPx);
      recordSlabPass(encoder, slabIndex, target, windowed, ctx, slabPickables, timing);
      encoder.copyTextureToBuffer(
        { texture: target.pickTexture, origin: { x: 0, y: 0, z: 0 } },
        { buffer: staging, bytesPerRow: 256 },
        { width: 1, height: 1, depthOrArrayLayers: 1 },
      );
      stagingInOrder.push(staging);
    }
    device.queue.submit([encoder.finish()]);

    inFlight = true;
    try {
      const perSlabRaw: number[] = [];
      for (const staging of stagingInOrder) {
        try {
          await staging.mapAsync(GPUMapMode.READ);
        } catch (err) {
          // Buffer torn down by destroy() during the await — harmless.
          if (destroyed && (err as Error).name === 'AbortError') return null;
          throw err;
        }
        const mapped = new Uint32Array(staging.getMappedRange(0, 4));
        perSlabRaw.push(mapped[0]!);
        staging.unmap();
      }
      // Near→far fold: the first non-zero slab claims the pixel (frontmostPick),
      // then the winning word is decoded into a (sourceCode, localIdx) pair.
      return unpackPick(frontmostPick(perSlabRaw));
    } finally {
      inFlight = false;
    }
  }

  function renderForDebug(): readonly GPUTexture[] {
    const ctx = pickFrameContext(state, canvas);
    if (ctx === null) return [];

    // The debug overlay samples EVERY slab that has an enabled pickable layer —
    // not just the cosmological slab. Reuse the same slab enumeration the real
    // `pick()` path uses (`pickablesBySlab`, near→far) so star / Milky-Way picks
    // on NEAR0 show up in the overlay too.
    const groups = pickablesBySlab(ctx);
    if (groups.length === 0) return [];

    const w = canvas.width;
    const h = canvas.height;
    // Record every slab's pick pass on ONE encoder. Each slab writes its OWN
    // colour + depth textures (module header: body rows can't share one here,
    // unlike `pick()`), so the passes share no mutable TARGET; the one
    // mutable buffer shared across passes (`bodyPickRenderer`'s sphere/point
    // slots) is why `beginSubmit()` below is load-bearing, not optional. No
    // timing descriptor: the debug overlay is not the timed 'pick' pass, and
    // consuming the shared query-set slot here would double-book it against a
    // real pick.
    const encoder = device.createCommandEncoder({ label: 'pick-program-debug-encoder' });
    // Same per-submit reset as `pick()` — this encoder also spans multiple passes.
    state.gpu.bodyPickRenderer?.beginSubmit();
    const touched = new Set<number>();
    const texturesNearToFar: GPUTexture[] = [];
    for (const { slabIndex, view, passes: slabPickables } of groups) {
      const target = ensureDebugTarget(slabIndex, w, h);
      touched.add(slabIndex);
      recordSlabPass(encoder, slabIndex, target, view, ctx, slabPickables, undefined);
      texturesNearToFar.push(target.pickTexture);
    }
    device.queue.submit([encoder.finish()]);
    evictStaleDebugTargets(touched);

    // Return FAR → NEAR so the caller can paint the textures in order with the
    // overlay's premultiplied OVER blend: farther slabs first, nearer slabs on
    // top. Because background texels pack to 0 (alpha 0 → no-op blend), a nearer
    // slab's real pick composites over a farther one — the same near-wins
    // occlusion `frontmostPick` folds on the CPU for the hover/click path.
    return texturesNearToFar.reverse();
  }

  function destroy(): void {
    destroyed = true;
    sharedColour?.destroy();
    sharedColour = null;
    for (const depth of sharedDepth.values()) depth.destroy();
    sharedDepth.clear();
    for (const staging of slabStaging.values()) staging.destroy();
    slabStaging.clear();
    evictStaleDebugTargets(new Set()); // nothing "touched" → evicts every entry
  }

  return {
    label: 'pickProgram',
    pick,
    renderForDebug,
    destroy,
  };
}
