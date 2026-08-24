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
 * ### Two-sided draw + front_facing duty split + depth test, no branch
 *
 * The shell pipeline draws BOTH walls (`cullMode: 'none'`) and the fragment splits
 * duty by `@builtin(front_facing)`: the NEAR (front) wall carries the over-disc
 * aerial perspective (haze on the lit disc), the FAR (back) wall carries the limb
 * + sky. Depth-testing EACH wall against the already-stamped opaque scene
 * (`depthCompare: 'greater-equal'`, `depthWriteEnabled: false`) keeps cross-body
 * occlusion for both — a nearer body occludes the disc haze via the near wall's
 * depth and the limb via the far wall's — with no branch. Under the NEAR0 slab's
 * reversed-Z convention (clear `0.0`, greater-z-wins) the compare is GREATER-equal,
 * not less-equal: the EQUAL half lets the shell that hugs a body's own surface
 * still pass against the depth that surface stamped, so the atmosphere is not
 * culled by the very sphere it wraps. `cloudShellRenderer`
 * back-culls (`cullMode: 'back'`); this shell and `ringRenderer` share
 * `cullMode: 'none'`.
 *
 * ### One bundle per `paramsById` row
 *
 * The factory takes the whole `paramsById` table and builds one bundle per row
 * (Earth alone today): that body's three LUT textures + three uniform buffers +
 * four bind groups. The pipelines, sampler, and proxy-sphere mesh are built ONCE
 * and shared across every bundle — one program serves all bodies. Per-body buffers
 * are the WebGPU `queue.writeBuffer` ordering trap defused by construction: a
 * later body's per-frame write lands in a DIFFERENT buffer, so no shared state
 * exists for the race to corrupt. Adding an atmosphere body is a new `paramsById`
 * row — no renderer change.
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
   * Regenerate body `bodyId`'s per-frame sky-view LUT into its own texture via a
   * compute pass recorded into the SAME frame `encoder` (before the foreground
   * render pass opens). Writes `skyViewUniforms` to that body's `SkyViewParams`
   * buffer first, then dispatches. THROWS on an unknown `bodyId` (a programming
   * error — callers only pass `atmosphereDrawList` ids, which come from the same
   * table this renderer bundles). Modeled on `flowFieldRenderer.encodeCompute`.
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
   *   f32 2 : twilightSoftness — night-limb sun-fade width in mu (cos-zenith). Rides
   *           HERE, not on the construction-written `ScatteringParams`, alongside the
   *           per-frame camera/sun state (this buffer is repacked every frame); its
   *           value is read from the body's `AtmosphereParams` row.
   *   f32 3 : twilightIntensity — brightness gain on the twilight band. Rides HERE
   *           alongside `twilightSoftness`, likewise sourced from the body's
   *           `AtmosphereParams` row.
   */
  encodeSkyView(encoder: GPUCommandEncoder, bodyId: string, skyViewUniforms: Float32Array): void;

  /**
   * Upload the host body's ring-alpha strip and rebind it at the shell's
   * binding 4, replacing the shared 1×1 transparent placeholder. The shell
   * fragment samples it to keep a ring that sits IN FRONT of the atmosphere
   * from being darkened by the shell's over-blend (the strip alpha scales the
   * shell's in-scatter + opacity down where the ring blocks it). A `bodyId`
   * with no atmosphere bundle is a graceful NO-OP — the ring→atmosphere link is
   * optional by data (a ring host without an `ATMOSPHERE_PARAMS` row has no
   * shell to occlude), unlike `draw`'s programming-error throw. Mirrors
   * `TexturedBodyRenderer.setRingTexture` (same strip, same host-body keying).
   */
  setRingTexture(bodyId: string, bitmap: ImageBitmap): void;

  /**
   * Draw body `bodyId`'s atmosphere-top proxy sphere (both walls) into the open
   * foreground pass, as TWO draws of the same geometry: MULTIPLY (per-channel
   * extinction of the destination) then ADD (the exposed in-scatter). The order is
   * load-bearing — see the renderer's `draw`.
   *
   * `uniforms` is the 112-byte `AtmosphereUniforms` record from
   * `packAtmosphereUniforms` (MVP + body-local sun dir + bottomRadius +
   * camPosLocal + exposure + ring ratios). THROWS on an unknown
   * `bodyId` (a programming error — callers only pass `atmosphereDrawList` ids).
   */
  draw(pass: GPURenderPassEncoder, bodyId: string, uniforms: Float32Array): void;
};
