/**
 * milkyWayRenderer — single-quad procedural Milky Way impostor at the
 * world origin.
 *
 * Sibling to `proceduralDiskRenderer.ts` (per-galaxy 3D-oriented
 * impostors) and `quadRenderer.ts` (textured screen-aligned thumbnails)
 * but with a degenerate cardinality: this pass renders exactly ONE
 * instance per frame.  No per-galaxy vertex buffer, no instancing —
 * just a six-vertex `draw(6, 1)` call.
 *
 * The GPU side is a hand port of a CC0 ShaderToy "Spiral galaxy"
 * fragment shader.  See `shaders/milkyWayImpostor.wgsl` for the WGSL
 * source and the per-line port notes.
 *
 * ### Uniform buffer ABI
 *
 * 112 bytes total — first 80 bytes are the shared `CameraUniforms`
 * prefix from `lib/camera.wesl`, followed by the renderer-specific
 * camera position + scalars + tail pad:
 *
 *   offset 0   | mat4x4<f32> cam.viewProj    — vertex stage projects the
 *                                                world-anchored billboard
 *   offset 64  | vec2<f32>   cam.viewportPx  — UNUSED here (ABI symmetry
 *                                                with peer renderers)
 *   offset 72  | f32         cam._pad0       — reserved by CameraUniforms
 *   offset 76  | f32         cam._pad1       — reserved by CameraUniforms
 *   offset 80  | vec3<f32>   cameraPosWorld  — drives both the vertex
 *                                                stage's view-aligned
 *                                                billboard basis and the
 *                                                fragment stage's
 *                                                synthetic-camera ray
 *                                                origin
 *   offset 92  | f32         fadeAlpha       — distance-based alpha [0..1]
 *   offset 96  | f32         iTime           — animation time (sec * 0.25)
 *   offset 100 | f32 × 3     _pad            — round struct up to 112 B
 *
 * #### Why the field order changed (vs the pre-WESL-conversion layout)
 *
 * The previous layout placed `fadeAlpha` + `iTime` at offsets 72/76,
 * which collide with the `_pad0/_pad1` slots that `CameraUniforms`
 * reserves. To embed `cam: CameraUniforms` as the first field we
 * had to relocate the renderer-specific scalars after the cam block.
 * `cameraPosWorld` (vec3, 16-byte alignment) lands naturally at
 * offset 80 — the first 16-byte boundary after cam — and the two
 * f32 scalars fall in at 92 / 96. CPU-side: `fadeAlpha` moved from
 * f32 index 18 → 23, `iTime` moved from f32 index 19 → 24,
 * `cameraPosWorld` stays at 20..22.
 *
 * **viewProj is load-bearing.** Earlier this pass emitted directly
 * in clip-space (slot 0 was kept "for ABI symmetry") and the impostor
 * was always full-screen regardless of camera distance.  The
 * world-anchored billboard fixes that — the vertex stage projects each
 * corner via `worldToClip(u.cam, p)` so the quad's apparent angular
 * size on screen scales as `2 * atan(milkyWayHalfExtent /
 * cameraDistance)`.
 *
 * **cameraPosWorld is also load-bearing.** Earlier the fragment stage
 * hard-coded `ro = vec3(0, 0.7, 2) * 0.75` for its synthetic camera
 * (the user reported "the galaxy is not moving around when the camera
 * is moving" because of this).  We now pass the real camera position
 * and the fragment stage transforms it into the galactic frame to
 * drive the raymarched render — orbiting reveals different aspects of
 * the spiral.
 *
 * `viewportPx` stays unused: the fragment shader works in the
 * impostor's local UV directly, never in pixel coordinates.
 *
 * ### Why no instance vertex buffer?
 *
 * `proceduralDiskRenderer.ts` packs per-galaxy data (xyz, size,
 * orientation, colour-index, crossfade) into a per-instance vertex
 * buffer.  This pass has no such per-galaxy data — there is exactly
 * one impostor at one fixed position (the world origin, baked into the
 * shader).  We do not even need a vertex buffer; the vertex stage
 * looks up its corner from a const `array<vec2<f32>, 6>` indexed by
 * `@builtin(vertex_index)`.
 */

import wgsl from './shaders/milkyWayImpostor.wesl?static';
import { createShaderModuleWithDevLog } from './shaderCompileLogger';

type Init = {
  device: GPUDevice;
  format: GPUTextureFormat;
};

export class MilkyWayRenderer {
  /**
   * Public constant pinning the on-the-wire uniform buffer size.  Must
   * match the WESL `Uniforms` struct's std140-ish layout
   * (`CameraUniforms` 80 B + vec3 cameraPosWorld 12 B + 2 × f32 8 B +
   * 12 B tail pad = 112 bytes) byte-for-byte.  Changing one without
   * the other yields silent uniform-read corruption.
   */
  static readonly UNIFORM_BUFFER_SIZE = 112;

  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;

  constructor(init: Init) {
    const { device, format } = init;
    this.device = device;

    const module = createShaderModuleWithDevLog(device, wgsl, 'milkyWay');

    this.bindGroupLayout = device.createBindGroupLayout({
      label: 'milkyWay-bgl-uniforms',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    this.uniformBuffer = device.createBuffer({
      label: 'milkyWay-uniform-buffer',
      size: MilkyWayRenderer.UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'milkyWay-bg-uniforms',
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'milkyWay-pipeline-layout',
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.pipeline = device.createRenderPipeline({
      label: 'milkyWay-pipeline',
      layout: pipelineLayout,
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Pure additive — the Milky Way impostor is *pure
            // emission* (it adds light to the scene where the spiral is
            // bright; nothing happens where it isn't).  An earlier
            // revision used the same premultiplied-OVER blend that the
            // points / disk passes use:
            //
            //   srcFactor: 'one', dstFactor: 'one-minus-src-alpha'
            //
            // That's right for textured-thumbnail quads (which COVER
            // the underlying point billboard with the photographed
            // galaxy), but wrong for an emissive impostor.  With OVER,
            // even tiny noise-floor alpha leaking into "dark" corners
            // — from `pow(0, near_zero)` corner cases in the height
            // function, or the star-cell sampler returning near-zero
            // distances at random fragment positions — produces a
            // faint square outline at the quad boundary because those
            // fragments end up with a small but non-zero `1 -
            // src_alpha` term subtracting from the destination.
            //
            // Pure additive (`dstFactor: 'one'`) sidesteps the alpha
            // reasoning entirely: each pixel contributes `col × alpha`
            // (the premultiplied src colour) ON TOP of whatever was
            // there before.  Dark fragments contribute zero.  No
            // square outline.  No mask-shape artefacts.  The user's
            // earlier report — "the black quad is still there" /
            // "outside the unit circle is black" — was specifically
            // this OVER-blend leakage; switching to additive makes
            // those bugs go away by construction.
            //
            // Why this differs from the procedural-disk pass: those
            // disks render a shaped silhouette (an elliptical disk
            // with sharp edge) whose brightness *should* darken the
            // catalog points behind it (because the procedural disk is
            // representing the galaxy's body, not just emitted light).
            // The Milky Way impostor isn't shaped like that — it's a
            // raymarched volumetric glow whose extent is defined by
            // its own brightness falloff.  Pure additive is the
            // physically right choice here.
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  /**
   * Issue the single-instance draw.  Encodes a 6-vertex / 1-instance
   * call after writing the uniform buffer.  Caller is responsible for
   * gating on the user's "Show Milky Way" toggle and the distance-fade
   * threshold (`fadeAlpha === 0` is the natural skip condition; the
   * caller should `return` instead of submitting a no-op draw to keep
   * the per-frame cost honest at zero when the impostor is invisible).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    fadeAlpha: number,
    iTimeSec: number,
    cameraPosWorld: [number, number, number],
  ): void {
    // Pack uniforms into a 112-byte ArrayBuffer matching the WESL
    // `Uniforms` struct layout.  See the class doc-comment for the
    // full offset table.
    const uniforms = new ArrayBuffer(MilkyWayRenderer.UNIFORM_BUFFER_SIZE);
    const f32 = new Float32Array(uniforms);
    // cam.viewProj — mat4 (offsets 0..63 / floats 0..15)
    f32.set(viewProj, 0);
    // cam.viewportPx — vec2 (offsets 64..71 / floats 16..17).  Unread
    // by this pass but uploaded for ABI symmetry with the rest of the
    // engine (every other renderer reads viewportPx for pxPerRad-style
    // derivations).
    f32[16] = viewport[0];
    f32[17] = viewport[1];
    // cam._pad0/_pad1 (offsets 72..79 / floats 18..19) — reserved by
    // CameraUniforms.  Stays zero (ArrayBuffer init handles it).
    // cameraPosWorld — vec3 (offsets 80..91 / floats 20..22).  Float
    // 22 is the third component of the vec3, NOT padding; the next
    // 16-byte boundary is at offset 96, so the implicit padding sits
    // at offset 92 in WGSL terms — but our layout repurposes that
    // slot as the next field (fadeAlpha) since vec3 + f32 fits in a
    // 16-byte chunk without extra alignment loss.
    f32[20] = cameraPosWorld[0];
    f32[21] = cameraPosWorld[1];
    f32[22] = cameraPosWorld[2];
    // fadeAlpha (offset 92 / float 23) — sits in the f32 slot
    // immediately after the vec3, packing the vec3+f32 quad into
    // bytes 80..95.
    f32[23] = fadeAlpha;
    // iTime (offset 96 / float 24).  Note: this moved from float
    // index 19 in the pre-CameraUniforms layout — the cam prefix
    // now occupies 0..79 and the renderer-specific scalars sit
    // after the cameraPosWorld vec3.
    f32[24] = iTimeSec;
    // Floats 25..27 are tail padding (offsets 100..111) rounding
    // the struct size up to a 16-byte multiple.  Stays zero.
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6, 1);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
  }
}
