/**
 * EngineContext — the init-time services a visualization acquires resources from.
 *
 * Where `FrameContext` is the per-frame snapshot, this is the one-time bundle
 * passed to `Visualization.init`. It is the seam through which a layer reaches
 * the GPU and the shared field WITHOUT knowing how the engine wired them up:
 *
 *   - `device` — the WebGPU device, for creating buffers / pipelines / bind
 *     groups the layer owns.
 *   - `hdrFormat` — the format of the engine's shared HDR accumulation target,
 *     so a layer builds render pipelines whose colour target matches the pass
 *     it will be asked to encode into (they MUST agree or the pipeline is
 *     invalid).
 *   - `field` — the shared, already-uploaded velocity field (3D texture +
 *     sampler + metadata). Every layer samples the same field; the engine
 *     loads it once and shares it here rather than each layer re-fetching.
 *   - `createShaderModule` — the engine's shader factory (wraps the iOS-safe
 *     compile-error logger). Layers compile WGSL through this so a bad shader
 *     surfaces a readable error instead of a silently-dropped frame.
 *
 * Keeping these as an explicit contract (rather than handing the layer the
 * whole engine) is what lets a visualization be reasoned about and tested
 * against a small, fakeable surface.
 */
import type { VelocityField } from '../field/VelocityField';

export type EngineContext = {
  readonly device: GPUDevice;
  readonly hdrFormat: GPUTextureFormat;
  readonly field: VelocityField;
  readonly createShaderModule: (code: string, label: string) => GPUShaderModule;
};
