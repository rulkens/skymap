/**
 * AtmosphereShellRenderer — Earth's physically-based in-scatter atmosphere,
 * drawn as a translucent shell just outside the cloud shell (spec §8).
 *
 * This is the renderer that composes the six Task-E4 WESL modules into a working
 * layer: three LUT bakes plus a shell draw. It owns three `rgba16float` lookup
 * textures and their compute pipelines, the proxy sphere geometry, the shell
 * render pipeline, and the three uniform buffers (`ScatteringParams`,
 * `SkyViewParams`, `AtmosphereUniforms`).
 *
 * ### The three-LUT structure (Bruneton/Hillaire)
 *
 * The per-pixel sky march is precomputed into 2D tables so the shell fragment
 * costs a couple of texture samples, not a march (spec §11):
 *
 *   - **Transmittance** (256×64) — baked ONCE at construction. The rgb fraction
 *     of sunlight surviving from a point `(r, mu)` to the top of atmosphere.
 *   - **Multi-scatter** (32×32) — baked ONCE at construction, AFTER transmittance
 *     (it samples it). Hillaire's isotropic higher-order estimate.
 *   - **Sky-view** (192×108) — baked EVERY FRAME (`encodeSkyView`), because it
 *     folds in the current camera altitude + sun direction. Samples both startup
 *     LUTs and composes the final in-scattered sky radiance.
 *
 * ### On-device startup bake (transmittance → multi-scatter, one encoder)
 *
 * The two view-independent LUTs are baked at construction into ONE command
 * encoder and submitted once — the multi-scatter pass barriers after the
 * transmittance pass because WebGPU inserts a storage barrier between two compute
 * passes in the same encoder (the two-pass ordering `flowFieldRenderer` and
 * `createGenerationPipelines` document). This is the on-device bake of spec §8.2.
 *
 * ### Back-face draw + depth test splits the three regions for free
 *
 * The shell pipeline culls FRONT faces (`cullMode: 'front'`), so only the
 * atmosphere-top proxy sphere's FAR wall rasterises. Depth-testing that far wall
 * against the already-stamped opaque planet (`depthCompare: 'less-equal'`,
 * `depthWriteEnabled: false`) is what separates limb (space behind → passes),
 * over-disc (planet behind → occluded), and a nearer body in front — with no
 * branch. This is the delta vs `ringRenderer` (`cullMode: 'none'`) and
 * `cloudShellRenderer` (`cullMode: 'back'`).
 *
 * ### One baked set in v1
 *
 * The renderer bakes ITS `AtmosphereParams` set once (Earth today). A second
 * atmosphere body would want a second renderer instance (its own LUT set); the
 * factory takes the params so that extension is a construction-site choice, no
 * renderer change.
 *
 * ### Explicit bind-group layouts everywhere (the `'auto'` trap)
 *
 * Every pipeline is built with an explicit `GPUBindGroupLayout` +
 * `GPUPipelineLayout`, never `layout: 'auto'` — auto-derived layouts are
 * pipeline-specific even when bindings are identical
 * (`feedback_webgpu_auto_layout_trap`).
 *
 * Extends `Renderer` for the shared `label` + `destroy` contract.
 */

import type { Renderer } from './Renderer';

export type AtmosphereShellRenderer = Renderer & {
  /**
   * Regenerate the per-frame sky-view LUT into this renderer's own texture via a
   * compute pass recorded into the SAME frame `encoder` (before the foreground
   * render pass opens). Writes `skyViewUniforms` to the internal `SkyViewParams`
   * buffer first, then dispatches. Modeled on `flowFieldRenderer.encodeCompute`.
   *
   * `skyViewUniforms` is the 16-byte (4 × f32) `SkyViewParams` record the caller
   * (Task 6) packs — written to the internal buffer VERBATIM, so its layout is
   * fixed here:
   *
   *   f32 0 : viewHeightKm  — camera radius from the planet centre, in KM. MUST
   *           equal the camera radius the shell fragment's `camPosLocal` encodes,
   *           converted to km: `|camPosLocal| × atmosphereTopKm` (the LUT
   *           parametrisations are ratio-based, so the km-baked table and the
   *           local-unit fragment agree only if this radius does).
   *   f32 1 : sunZenithCos  — `dot(localUp, sunDirLocal)`, where
   *           `localUp = normalize(camPosLocal)` (cos of the sun's zenith angle at
   *           the camera).
   *   f32 2 : _pad0         — zero (rounds the struct to 16 bytes).
   *   f32 3 : _pad1         — zero.
   */
  encodeSkyView(encoder: GPUCommandEncoder, skyViewUniforms: Float32Array): void;

  /**
   * Draw the atmosphere-top proxy sphere's back faces into the open foreground
   * pass. `uniforms` is the 112-byte `AtmosphereUniforms` record from
   * `packAtmosphereUniforms` (MVP + body-local sun dir + bottomRadius +
   * camPosLocal + sunIrradiance + exposure).
   */
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void;
};
