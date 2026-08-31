/**
 * pickProgram — the parallel per-slab pick program over the content-layer
 * registry.
 *
 * ### Why pick is NOT a FRAME member
 *
 * The visual FRAME is a linear `FrameStep[]` the executor walks once per
 * animation tick (`frameProgram.ts` / `executeFrame.ts`). Pick is deliberately
 * NOT one of those steps: it is a demand-driven query (hover / click), it
 * produces a value rather than swap-chain pixels, and it runs on its OWN
 * command encoder + `queue.submit` at a cadence set by pointer events, not the
 * render loop. Folding it into the FRAME would braid "which galaxy is under the
 * cursor?" into "draw the next frame" — two concerns that vary independently.
 * So this program is a sibling of the FRAME executor: it shares only the same
 * `ContentLayer` registry, filters it by `drawPick` presence + the pick gate
 * `(pickEnabled ?? enabled)` — a layer's own pick gate wherever its pick set
 * differs from its draw set, else `enabled` (see `ContentLayer.pickEnabled`) —
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
 * ### Targets owned internally this phase
 *
 * The `RenderTargetSpec` / renderTargets table doesn't carry pick rows yet, so
 * this program allocates its own `pick:cosmo` (r32uint + depth24plus) and
 * `pick:near0` (r32uint + depth32float) targets, lazily and resize-aware, one
 * per slab that actually has an enabled pickable layer. A slab with no pickable
 * layer is never allocated — `pick:near0` exists only while a near-field
 * pickable (the Milky-Way impostor or the Gaia star catalog) passes its
 * visibility gate; on a cosmic-zoom frame neither is enabled and it stays unallocated.
 *
 * @module
 */

import type { PickProgram } from '../../../@types/engine/frame/PickProgram';
import type { ContentLayer } from '../../../@types/engine/frame/ContentLayer';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { PickResult } from '../../../@types/data/PickResult';
import { pickFrameContext } from '../helpers/pickFrameContext';
import { slabViewOf, COSMO } from './slabs';
import { frontmostPick } from '../../../utils/picking/frontmostPick';
import { depthClearValueFor } from '../../../utils/gpu/depthClearValueFor';
import { unpackPick } from '../../../data/selectionEncoding';

// The r32uint pick texture is written by the pass and read back a texel at a
// time; the depth attachment resolves overlapping billboards so the front-most
// wins (matching visual occlusion). Any pipeline drawing into a slab's pick
// pass must declare the matching depthStencil format: the points / ring / disk
// picks declare depth24plus (COSMO), the Milky-Way pick declares depth32float
// (NEAR0 — see milkyWayPickRenderer).
const COSMO_DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';
const NEAR0_DEPTH_FORMAT: GPUTextureFormat = 'depth32float';

/** Human-readable `RenderTargetSpec.id` for a slab's pick target. */
function pickTargetId(slabIndex: number): string {
  return slabIndex === COSMO ? 'pick:cosmo' : 'pick:near0';
}

/** Depth format for a slab's pick target — see the format constants above. */
function pickDepthFormat(slabIndex: number): GPUTextureFormat {
  return slabIndex === COSMO ? COSMO_DEPTH_FORMAT : NEAR0_DEPTH_FORMAT;
}

// One slab's pick target: the r32uint colour texture, its depth attachment,
// and the MAP_READ staging buffer the cursor texel is copied into. `width` /
// `height` track the viewport so a resize reallocates the textures.
type PickSlabTarget = {
  pickTexture: GPUTexture;
  depthTexture: GPUTexture;
  width: number;
  height: number;
};

/**
 * Construct the pick program bound to `device` + `canvas`, driven by the
 * shared `state` and the content-layer registry `layers`. This is the single
 * owner of the hover / click / debug-overlay pick path.
 */
export function createPickProgram(deps: {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  state: EngineState;
  layers: readonly ContentLayer[];
}): PickProgram {
  const { device, canvas, state, layers } = deps;

  // Per-slab pick targets + staging buffers, allocated lazily on first use for
  // a slab and recreated on viewport change. A slab with no pickable layer is
  // never inserted here — that is what keeps `pick:near0` unallocated at N=1.
  const slabTargets = new Map<number, PickSlabTarget>();
  // Staging buffers are size-invariant (256 bytes, one texel), so they persist
  // across resizes even though the textures don't.
  const slabStaging = new Map<number, GPUBuffer>();

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

  /**
   * Lazily (re)allocate a slab's pick + depth textures. No-op when the
   * dimensions already match. Inserting into `slabTargets` here is what marks
   * a slab as "allocated" — callers only reach this for slabs with a pickable
   * layer.
   */
  function ensureSlabTextures(slabIndex: number, w: number, h: number): PickSlabTarget {
    const existing = slabTargets.get(slabIndex);
    if (existing && existing.width === w && existing.height === h) return existing;

    existing?.pickTexture.destroy();
    existing?.depthTexture.destroy();

    const id = pickTargetId(slabIndex);
    const target: PickSlabTarget = {
      pickTexture: device.createTexture({
        label: `${id}-target`,
        size: { width: w, height: h },
        format: 'r32uint',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.TEXTURE_BINDING,
      }),
      depthTexture: device.createTexture({
        label: `${id}-depth`,
        size: { width: w, height: h },
        format: pickDepthFormat(slabIndex),
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      }),
      width: w,
      height: h,
    };
    slabTargets.set(slabIndex, target);
    return target;
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
    ctx: ReadyFrameContext,
    slabPickables: readonly ContentLayer[],
    timing: GPURenderPassTimestampWrites | undefined,
  ): void {
    const view = slabViewOf(ctx, slabIndex);
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

    for (const layer of slabPickables) {
      layer.drawPick!(pass, view, ctx, state);
    }

    pass.end();
  }

  // Pickable layers grouped by slab, near→far. Registry order is preserved
  // within each slab (a `.filter()` keeps the array order), which is the
  // @group(0) prefix contract: point-sprites runs first in the COSMO pass and
  // leaves slot 0 bound to the shared pick camera for the ring / disk
  // fold-ins. (The NEAR0 pickables — the Milky-Way impostor and the Gaia star
  // catalog — share no such prefix: each binds its OWN complete slot-0 camera in
  // its own draw, so their registry order carries no @group(0) dependence.)
  function pickablesBySlab(
    ctx: ReadyFrameContext,
  ): { slabIndex: number; layers: ContentLayer[] }[] {
    // No body-slab layer declares `drawPick` yet (Tasks 9-11), so `'body'`
    // layers are excluded up front rather than threaded through the
    // per-slab view resolution below — a `'body'` layer has no single
    // `slabIndex` to resolve a view against.
    const candidates = layers.filter((l) => l.drawPick && l.slab !== 'body');
    const slabIndices = [...new Set(candidates.map((l) => l.slab as number))].sort((a, b) => a - b);
    return slabIndices
      .map((slabIndex) => {
        const view = slabViewOf(ctx, slabIndex);
        // Filter by the PICK gate: `pickEnabled` when a layer declares one (its
        // pick set differs from its draw set — planetsLayer's flat ∪ textured,
        // the caption stamps, the Milky Way's narrower close-range gate), else
        // `enabled` (pick set == draw set, the common case). See
        // `ContentLayer.pickEnabled`.
        const layers = candidates.filter(
          (l) => l.slab === slabIndex && (l.pickEnabled ?? l.enabled)(state, ctx, view),
        );
        return { slabIndex, layers };
      })
      .filter((group) => group.layers.length > 0);
  }

  async function pick(pickXPx: number, pickYPx: number): Promise<PickResult | null> {
    if (inFlight) return null;

    const ctx = pickFrameContext(state, canvas);
    if (ctx === null) return null;

    const groups = pickablesBySlab(ctx);
    if (groups.length === 0) return null; // no pickable layer → no GPU work

    const w = canvas.width;
    const h = canvas.height;
    // Clamp so `copyTextureToBuffer` stays inside the texture (DPR-scaled CSS
    // coords can land out of range during a resize).
    const px = Math.max(0, Math.min(w - 1, Math.floor(pickXPx)));
    const py = Math.max(0, Math.min(h - 1, Math.floor(pickYPx)));

    const encoder = device.createCommandEncoder({ label: 'pick-program-encoder' });

    // Record every slab's pass + cursor-texel copy on ONE encoder; the staging
    // buffers are collected in slab order (near→far) so the readback fold is a
    // simple "first non-zero".
    const stagingInOrder: GPUBuffer[] = [];
    for (const { slabIndex, layers: slabPickables } of groups) {
      const target = ensureSlabTextures(slabIndex, w, h);
      const staging = ensureSlabStaging(slabIndex);
      const timing =
        slabIndex === COSMO ? state.gpu.timingService.descriptorFor('pick') : undefined;
      recordSlabPass(encoder, slabIndex, target, ctx, slabPickables, timing);
      encoder.copyTextureToBuffer(
        { texture: target.pickTexture, origin: { x: px, y: py, z: 0 } },
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
    // colour + depth textures and each layer's `drawPick` binds its own per-draw
    // uniforms, so the passes share no mutable buffer — no writeBuffer/submit
    // ordering hazard from batching them. No timing descriptor: the debug
    // overlay is not the timed 'pick' pass, and consuming the shared query-set
    // slot here would double-book it against a real pick.
    const encoder = device.createCommandEncoder({ label: 'pick-program-debug-encoder' });
    const texturesNearToFar: GPUTexture[] = [];
    for (const { slabIndex, layers: slabPickables } of groups) {
      const target = ensureSlabTextures(slabIndex, w, h);
      recordSlabPass(encoder, slabIndex, target, ctx, slabPickables, undefined);
      texturesNearToFar.push(target.pickTexture);
    }
    device.queue.submit([encoder.finish()]);

    // Return FAR → NEAR so the caller can paint the textures in order with the
    // overlay's premultiplied OVER blend: farther slabs first, nearer slabs on
    // top. Because background texels pack to 0 (alpha 0 → no-op blend), a nearer
    // slab's real pick composites over a farther one — the same near-wins
    // occlusion `frontmostPick` folds on the CPU for the hover/click path.
    return texturesNearToFar.reverse();
  }

  function destroy(): void {
    destroyed = true;
    for (const target of slabTargets.values()) {
      target.pickTexture.destroy();
      target.depthTexture.destroy();
    }
    for (const staging of slabStaging.values()) {
      staging.destroy();
    }
    slabTargets.clear();
    slabStaging.clear();
  }

  return {
    label: 'pickProgram',
    pick,
    renderForDebug,
    destroy,
  };
}
