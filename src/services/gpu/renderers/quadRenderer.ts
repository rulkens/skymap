/**
 * QuadRenderer — billboard quad pass for galaxy thumbnails.
 *
 * Runs AFTER the existing point pass each frame.  Each instance is one
 * textured quad whose center matches a galaxy and whose size is
 * controlled by the engine.  We bind the atlas texture + sampler in
 * group(0) so the engine can re-bind cheaply as the atlas's underlying
 * GPUTexture stays put across frames.
 *
 * Why one atlas + one bind group?  WebGPU caps simultaneously-bound
 * textures at ~16, and a per-galaxy GPUTexture would thrash the
 * resource pool.  One atlas + one bind group = one draw call for
 * thousands of textured galaxies.
 *
 * ### Factory shape (Spec F.1)
 *
 * This module exports a `createQuadRenderer(ctx, maxInstances?): QuadRenderer`
 * factory plus the matching `type QuadRenderer = { ... }` interface.  The
 * pre-Spec-F revision shipped this as a `class QuadRenderer` with a
 * constructor doing the same wiring; converting to a closure-returning
 * factory matches the direction Spec D took every engine subsystem
 * (`createSelectionSubsystem`, `createTweenManager`, …) and the
 * already-factory `createPickRenderer`.  The previous private fields
 * are now closure-captured `const`s; the public methods (`bindAtlas`,
 * `draw`, `destroy`) are inline arrow properties on the returned
 * object.
 *
 * Why a factory?  Closures express "construct, then expose a small
 * surface" without the prototype machinery a class implies.  Tests
 * and consumers see exactly the same API shape — `r.draw(...)` /
 * `r.bindAtlas(...)` / `r.destroy()` — so the only call-site change
 * is `new QuadRenderer(...)` → `createQuadRenderer(...)`.
 */

import type { mat4 } from 'gl-matrix';
import type { GpuContext, QuadInstance } from '../../../@types';
import vsCode from '../shaders/quads/vertex.wesl?static';
import fsCode from '../shaders/quads/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/**
 * Per-instance vertex attributes packed as 12 floats / 48 bytes:
 *
 *   posSize: vec4<f32>  (xyz, sizeWorld)
 *   uvRect:  vec4<f32>  (u0, v0, u1, v1)
 *   extras:  vec4<f32>  (fadeAlpha, _, _, _)
 *
 * The third vec4 carries the per-frame fade multiplier produced by the
 * engine — a combination of distance fade (smoothstep across the
 * apparent-size threshold band) and load fade (a ~400 ms ramp once a
 * fresh bitmap lands in the atlas).  Three-of-four channels in `extras`
 * are reserved padding for future per-instance flags (e.g. selected,
 * highlighted) without growing the stride further.
 */
const FLOATS_PER_INSTANCE = 12;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

/**
 * 96-byte uniform layout, mirroring `struct Uniforms` in
 * `shaders/quads.wesl`. The first 80 bytes are the shared
 * `CameraUniforms` prefix from `shaders/lib/camera.wesl`; the
 * renderer-specific `camPosWorld + pxPerRad` pair sits AFTER it
 * starting at offset 80.
 *
 *   bytes  0..63 : viewProj      mat4x4<f32>  (CameraUniforms.viewProj)
 *   bytes 64..71 : viewportPx    vec2<f32>    (CameraUniforms.viewportPx)
 *   bytes 72..79 : _pad0, _pad1  2 × f32      (CameraUniforms reserved)
 *   bytes 80..91 : camPosWorld   vec3<f32>    (vec3 needs 16-B alignment, which 80 already provides)
 *   bytes 92..95 : pxPerRad      f32          (fills the trailing slot of camPosWorld's 16-B vec4 quantum)
 *
 * Total: 96 bytes — multiple of 16, no tail pad needed.
 *
 * Adopting `CameraUniforms` is a pure renaming at this layout: the
 * shared prefix overlays the previous `viewProj + viewport + _pad0
 * + _pad1` region byte-for-byte, so f32-indices for camPosWorld /
 * pxPerRad stay at 20..23 — the CPU writes below are unchanged from
 * before adoption.
 *
 * `camPosWorld` and `pxPerRad` are used by the vertex stage to compute
 * each quad's apparent angular radius from its world-space distance to
 * the camera, then convert to screen pixels via the pinhole relation
 * `pxRadius = (radius_Mpc / distance_Mpc) * pxPerRad`.  This replaces an
 * earlier "project a unit-X offset and measure the projected length"
 * scheme that varied with camera orientation: as the camera orbited a
 * galaxy, the world-X axis rotated relative to the view direction and the
 * projected length expanded/contracted accordingly, making the quad
 * apparently shrink/grow during orbit.
 */
const UNIFORM_BYTES = 96;

/**
 * Public surface of the quad renderer.  Mirrors the methods the
 * pre-factory `class QuadRenderer` exposed; consumers (engine,
 * thumbnail subsystem, frame body) see the identical shape.
 *
 * `destroy()` is new in F.1 — pre-factory the class had no teardown.
 * It releases the uniform buffer + per-instance buffer (the only two
 * `GPUBuffer`s this renderer owns).  See the factory body for the
 * rationale on why pipeline / bind group / sampler aren't released
 * (they're JS-side handles, no device-side memory to reclaim).
 */
export type QuadRenderer = {
  /**
   * Bind the atlas texture view.  Must be called once after
   * `atlas.initTexture()`; the bind group can be reused across frames
   * because the atlas's underlying texture doesn't change identity.
   */
  bindAtlas(atlasView: GPUTextureView): void;
  /**
   * Issue the draw call.  `instances.length` must be ≤ `maxInstances`
   * (the engine pre-filters; in v1 the limit is set to the atlas slot
   * count of 256, so the cap is naturally tight).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    instances: ReadonlyArray<QuadInstance>,
    camPosWorld: Readonly<[number, number, number]>,
    pxPerRad: number,
  ): void;
  /**
   * Release every GPU buffer this renderer owns.  Pipeline / bind
   * group layout / bind group / sampler are JS-side handles with no
   * `.destroy()` of their own — JS GC reclaims them once the
   * renderer drops out of scope.  Only the uniform buffer + the
   * per-instance vertex buffer hold device-side memory.
   *
   * Idempotent: `GPUBuffer.destroy()` is a no-op on already-destroyed
   * buffers per the WebGPU spec, so a second `destroy()` call is safe.
   */
  destroy(): void;
};

export function createQuadRenderer(ctx: GpuContext, maxInstances = 256): QuadRenderer {
  const { device, format } = ctx;

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'quad-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'quads.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'quads.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'quad-pipeline',
    layout: device.createPipelineLayout({
      label: 'quads-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: BYTES_PER_INSTANCE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' }, // posSize
            { shaderLocation: 1, offset: 16, format: 'float32x4' }, // uvRect
            { shaderLocation: 2, offset: 32, format: 'float32x4' }, // extras (fadeAlpha + padding)
          ],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format,
          // Pure additive — galaxy thumbnails are EMISSIVE content
          // (a photograph of the galaxy's actual light output), not
          // opaque material occluding a background.  Additive blend
          // means a thumbnail simply ADDS its emission to whatever's
          // already in the HDR target; overlapping galaxies + the
          // Milky Way impostor accumulate naturally without one
          // covering up the other.
          //
          // An earlier revision used premultiplied OVER (`dstFactor:
          // 'one-minus-src-alpha'`) which treats the thumbnail as
          // opaque material with an alpha cutout: at fade-region
          // pixels (alpha < 1) it preserved (1 - alpha) of the
          // existing pixel.  Combined with depth-write that occluded
          // the later Milky Way pass, fade regions ended up as
          // `col*alpha` against a black HDR target — i.e. they faded
          // to BLACK instead of revealing the Milky Way underneath.
          // Pure additive sidesteps that entire reasoning.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  const uniformBuffer = device.createBuffer({
    label: 'quad-uniforms',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const instanceBuffer = device.createBuffer({
    label: 'quad-instances',
    size: maxInstances * BYTES_PER_INSTANCE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  const sampler = device.createSampler({
    label: 'quad-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // Mutable closure-captured slot for the atlas-bound bind group.  Set
  // by `bindAtlas`; consulted on every `draw` call.  Until the engine
  // calls `bindAtlas`, `draw` returns silently — same pre-factory
  // semantics as the class field guard.
  let bindGroup: GPUBindGroup | undefined;

  function bindAtlas(atlasView: GPUTextureView): void {
    bindGroup = device.createBindGroup({
      label: 'quad-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: atlasView },
        { binding: 2, resource: sampler },
      ],
    });
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    instances: ReadonlyArray<QuadInstance>,
    camPosWorld: Readonly<[number, number, number]>,
    pxPerRad: number,
  ): void {
    if (!bindGroup) return; // atlas not yet bound — skip silently
    if (instances.length === 0) return;

    // Pack uniforms — see UNIFORM_BYTES doc-comment for the layout.
    //   f32[0..15]   viewProj     — CameraUniforms.viewProj
    //   f32[16..17]  viewportPx   — CameraUniforms.viewportPx
    //   f32[18..19]  CameraUniforms reserved pad (left zero)
    //   f32[20..22]  camPosWorld  — Uniforms.camPosWorld (offset 80)
    //   f32[23]      pxPerRad     — Uniforms.pxPerRad    (offset 92)
    //
    // The CameraUniforms reserved pad slots at f32[18..19] MUST stay
    // zero — overwriting them silently shifts the WGSL view of every
    // later member.  `Float32Array` zero-initialises so we rely on
    // that rather than writing explicit zeros.
    const uni = new Float32Array(UNIFORM_BYTES / 4);
    uni.set(viewProj as Float32Array, 0);
    uni[16] = viewportPx[0];
    uni[17] = viewportPx[1];
    uni[20] = camPosWorld[0]; // camPosWorld.x at byte offset 80
    uni[21] = camPosWorld[1];
    uni[22] = camPosWorld[2];
    uni[23] = pxPerRad; // pxPerRad at byte offset 92
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    // Pack instances.  We allocate a fresh Float32Array each frame; for
    // the v1 instance cap of 256 that's 8 KB per frame, negligible
    // allocation cost.  If profiling later flags this we can swap to a
    // reusable scratch buffer sized at `maxInstances * BYTES_PER_INSTANCE`.
    const data = new Float32Array(instances.length * FLOATS_PER_INSTANCE);
    for (let i = 0; i < instances.length; i++) {
      const ins = instances[i]!;
      const base = i * FLOATS_PER_INSTANCE;
      data[base + 0] = ins.x;
      data[base + 1] = ins.y;
      data[base + 2] = ins.z;
      data[base + 3] = ins.sizeWorld;
      data[base + 4] = ins.u0;
      data[base + 5] = ins.v0;
      data[base + 6] = ins.u1;
      data[base + 7] = ins.v1;
      data[base + 8] = ins.fadeAlpha;
      // data[base + 9..11] reserved (left zero by Float32Array init)
    }
    device.queue.writeBuffer(instanceBuffer, 0, data);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, instanceBuffer);
    pass.draw(6, instances.length, 0, 0);
  }

  function destroy(): void {
    // Only the two GPUBuffers hold device-side memory.  Pipeline /
    // bind-group / sampler are JS-side handles with no `.destroy()`
    // method — GC reclaims them when the closure drops out of scope.
    uniformBuffer.destroy();
    instanceBuffer.destroy();
  }

  return { bindAtlas, draw, destroy };
}
