/**
 * FlowFieldRenderer — public handle for the CF4++ peculiar-velocity flow layer.
 *
 * The engine's first COMPUTE renderer. It owns the velocity `texture_3d`, one
 * shared particle buffer set (`part` / `trail` / `acc`), three compute pipelines
 * (`seed` / `advect` / `streamline`) sharing one explicit bind-group layout, and
 * the additive ribbon render pipeline. See `flowFieldRenderer.ts` for the full
 * pipeline details and `docs/superpowers/specs/2026-06-04-flow-field-integration-design.md`
 * for the design decisions (§1, §3, §5).
 *
 * ### Why the per-frame methods take `FlowSettings`, not the store
 *
 * Flow is a singleton overlay layer (see
 * `docs/superpowers/conventions/singleton-overlay-layers.md`): its look/motion
 * knobs live in `settings.flow` (a `FlowSettings`), and the layer's "loaded"
 * status is the asset slot's `ready` state — no data-layer store. So
 * `encodeCompute` / `draw` read the live `FlowSettings` the engine already
 * holds, rather than a store handle.
 *
 * ### One buffer set + reseed-on-switch (decision §3)
 *
 * A single `part`/`trail`/`acc` set is shared across both modes; the modes never
 * render simultaneously, so switching mode (or changing `count`) seeds afresh.
 * `maybeReseed` records "encode the seed pass next frame"; `encodeCompute`
 * consumes that flag, encoding the dedicated `seed` compute pass before the
 * steady integrator — both into the same frame encoder (decision §5: no
 * out-of-band submit; WebGPU inserts the storage barrier between compute
 * passes). Because `seed` reads only the `Prm` subset it shares with the
 * integrators (`n` / `frame` / `bias`), one `compPrm` write serves both passes,
 * which is what removes the spike's writeBuffer/submit seed race.
 */

import type { Mat4 } from 'wgpu-matrix';
import type { Vec2 } from '../math/Vec2';
import type { ScalarCube } from '../data/volume/ScalarCube';
import type { FlowSettings } from '../settings/FlowSettings';

export type FlowFieldRenderer = {
  /**
   * Human-readable identifier (`'flowFieldRenderer'`). Part of the shared
   * `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /**
   * Receive the decoded velocity cube and commit it: upload it to a 3D texture
   * (via `flowFieldFromCube`, using the renderer's own device — the device is
   * never exposed to the caller, mirroring `volumeFieldRenderer.upload`),
   * build the cube model matrix from its meta (via `buildCubeModelMatrix`), build
   * the compute bind group, and arm a reseed. Idempotent — disposes the prior
   * field's texture if re-set.
   */
  upload(cube: ScalarCube): void;
  /**
   * Record "encode the `seed` pass on the next `encodeCompute`". Called by the
   * Phase-D handle on enable / mode-switch / count-change. A no-op on steady
   * frames (the flag stays cleared).
   */
  maybeReseed(): void;
  /**
   * True once a velocity cube is uploaded and bound. Lets the flow fade row's
   * guard gate flow's fade on real renderable-ness.
   */
  fieldLoaded(): boolean;
  /**
   * Dispatch the compute work into the per-frame encoder: the `seed` pass when
   * a reseed is pending (then cleared), followed by the `advect` or `streamline`
   * integrator for `flow.mode`. Reads particle count / motion knobs off `flow`.
   * An internal frame counter (self-incremented per call, mirroring
   * `volumeFieldRenderer`) salts the per-particle RNG and advances the
   * streamline pulse phase. `nowMs` is the caller's real elapsed-time clock
   * (`ctx.nowMs`) — the renderer derives real elapsed seconds from it against
   * its own last-call timestamp, so advection speed and lifetime read in
   * seconds, not rendered frames. Caller gates on enabled + loaded (see
   * `encodeFlowCompute`).
   */
  encodeCompute(encoder: GPUCommandEncoder, flow: FlowSettings, nowMs: number): void;
  /**
   * Additive ribbon draw into the open HDR pass. Packs the `Cam` uniform
   * (mvp = `viewProj`, the cube `model`, aspect from `viewportPx`, the pulse
   * `phase`, `mode`, and the pre-blend `intensity` from `flow`) and draws
   * `2*TRAIL` vertices × `flow.count` instances. No-op until a field is set.
   *
   * `opacity` is the layer fade in [0, 1] (from `fades.opacityOf({kind:'flow'})`
   * at the call site); it's multiplied into the pre-blend intensity so the
   * whole overlay fades in/out with the enable/disable toggle.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    flow: FlowSettings,
    opacity: number,
  ): void;
  /** Release every GPU resource (buffers, pipelines, the velocity texture). */
  destroy(): void;
};
