/**
 * Visualization — the Strategy contract every renderable layer implements.
 *
 * Why this exists: cosmic-flow draws several independent "views" of the same
 * velocity field (streamlines, glyphs, volumetric density, …). Rather than
 * hard-wire each one into the engine with a growing switch, the engine knows
 * only this interface. Adding a layer is then a closed operation: implement
 * `Visualization` and `register()` it. The engine never changes.
 *
 * That is the Strategy pattern stated as a type. The engine owns the device,
 * the field, and the per-frame loop; each Visualization owns its pipelines,
 * buffers, and draw logic. The two halves meet only through the context
 * objects passed into the methods here — `EngineContext` at init time (the
 * services a layer acquires resources from) and `FrameContext` per frame
 * (everything needed to draw, nothing more).
 *
 * Lifecycle, in order:
 *   - `init(ctx)` — acquire GPU resources from the engine's services. May be
 *     async (shader fetch, field upload) so the return type allows a Promise.
 *   - `encodeCompute?(encoder, frame)` — OPTIONAL pre-render compute work
 *     (e.g. advancing streamline particles) recorded into the shared command
 *     encoder before the render pass opens. Layers with no compute omit it.
 *   - `encode(pass, frame)` — record draw calls into the active render pass.
 *   - `dispose()` — release every resource `init` acquired. Synchronous and
 *     idempotent-friendly so the engine can tear a layer down deterministically.
 *
 * `paramSpecs` is the layer's contribution to the data-driven UI (see
 * SliderSpec). `id`/`label` identify the layer for the registry and the
 * enable/disable toggle surfaced through `FrameContext.enabled`.
 */
import type { SliderSpec } from './SliderSpec';
import type { EngineContext } from '../engine/EngineContext';
import type { FrameContext } from '../engine/FrameContext';

export type Visualization = {
  readonly id: string;
  readonly label: string;
  readonly paramSpecs: readonly SliderSpec[];
  init(ctx: EngineContext): Promise<void> | void;
  encodeCompute?(encoder: GPUCommandEncoder, frame: FrameContext): void;
  encode(pass: GPURenderPassEncoder, frame: FrameContext): void;
  dispose(): void;
};
