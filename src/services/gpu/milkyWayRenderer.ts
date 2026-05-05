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
 * 96 bytes total — padded to the same shape as the procedural-disk
 * uniform layout so future refactors that share a uniform-pack helper
 * across passes don't have to special-case this one:
 *
 *   offset 0  | mat4x4<f32> viewProj       — vertex stage projects the
 *                                              world-anchored billboard
 *   offset 64 | vec2<f32>   viewport       — UNUSED (ABI symmetry)
 *   offset 72 | f32         fadeAlpha      — distance-based alpha, [0..1]
 *   offset 76 | f32         iTime          — animation time (sec * 0.25)
 *   offset 80 | vec3<f32>   cameraPosWorld — drives both the vertex
 *                                              stage's view-aligned
 *                                              billboard basis and the
 *                                              fragment stage's
 *                                              synthetic-camera ray
 *                                              origin
 *   offset 92 | f32         _pad           — alignment padding to 96 B
 *
 * **viewProj is now load-bearing.** Earlier this pass emitted directly
 * in clip-space (slot 0 was kept "for ABI symmetry") and the impostor
 * was always full-screen regardless of camera distance.  The
 * world-anchored billboard fixes that — the vertex stage projects each
 * corner via viewProj so the quad's apparent angular size on screen
 * scales as `2 * atan(milkyWayHalfExtent / cameraDistance)`.
 *
 * **cameraPosWorld is also load-bearing.** Earlier the fragment stage
 * hard-coded `ro = vec3(0, 0.7, 2) * 0.75` for its synthetic camera
 * (the user reported "the galaxy is not moving around when the camera
 * is moving" because of this).  We now pass the real camera position
 * and the fragment stage transforms it into the galactic frame to
 * drive the raymarched render — orbiting reveals different aspects of
 * the spiral.
 *
 * viewport stays unused: the fragment shader works in the impostor's
 * local UV directly, never in pixel coordinates.
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

import wgsl from './shaders/milkyWayImpostor.wgsl?raw';

type Init = {
  device: GPUDevice;
  format: GPUTextureFormat;
};

export class MilkyWayRenderer {
  /**
   * Public constant pinning the on-the-wire uniform buffer size.  Must
   * match the WGSL `Uniforms` struct's std140-ish layout (mat4 + vec2 +
   * 2 f32 + 16 bytes padding = 96 bytes) byte-for-byte.  Changing one
   * without the other yields silent uniform-read corruption.
   */
  static readonly UNIFORM_BUFFER_SIZE = 96;

  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;

  constructor(init: Init) {
    const { device, format } = init;
    this.device = device;

    const module = device.createShaderModule({ code: wgsl });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    this.uniformBuffer = device.createBuffer({
      size: MilkyWayRenderer.UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.pipeline = device.createRenderPipeline({
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
      // Depth state: TEST against the depth buffer the thumbnail / disk
      // passes wrote into, but DO NOT WRITE.
      //
      // Why test?  The Milky Way impostor sits at the world origin
      // (cz = 0).  Galaxies on the FAR side of the origin from the
      // camera have a larger world-space Z than the origin and their
      // thumbnails (drawn earlier in the pass with depthWriteEnabled =
      // true) populate the depth buffer with that larger value.  When
      // this pass's fragment shader runs at the same screen pixel, its
      // own clipPos.z is roughly the origin's Z — *less* than the
      // already-written thumbnail Z — so the `less` comparison passes
      // and the impostor draws over the thumbnail.  CORRECT: a far
      // galaxy is occluded by the Milky Way.
      //
      // Galaxies on the NEAR side of the origin do the opposite: their
      // thumbnail's depth is smaller than the impostor's, the impostor
      // fragment fails the `less` test, and the thumbnail survives
      // unobscured.  CORRECT: a near galaxy stays in front of the
      // Milky Way.
      //
      // Why not write depth?  The impostor is a raymarched volumetric
      // glow — its perceived 3D extent (the spiral disk reaching out
      // ~10 kpc from the centre, the bulge dominating ~1 kpc) is
      // implied by the fragment shader's brightness falloff, NOT by
      // the actual quad geometry.  Writing the quad's planar depth
      // would create a hard "Milky Way plane" depth boundary that
      // would punch a circular cut into any galaxy thumbnail drawn
      // afterward at greater world-Z, even though the impostor at
      // that pixel is essentially transparent (pure additive black).
      // Reading-without-writing is the standard "transparent emissive"
      // pattern for this exact scenario.
      depthStencil: {
        format: 'depth24plus',
        depthCompare: 'less',
        depthWriteEnabled: false,
      },
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
    // Pack uniforms into a 96-byte ArrayBuffer matching the WGSL
    // `Uniforms` struct layout.  See the class doc-comment for the
    // offset table.
    const uniforms = new ArrayBuffer(MilkyWayRenderer.UNIFORM_BUFFER_SIZE);
    const f32 = new Float32Array(uniforms);
    // mat4 viewProj (offsets 0..63 / floats 0..15)
    f32.set(viewProj, 0);
    // viewport (offsets 64..71 / floats 16..17)
    f32[16] = viewport[0];
    f32[17] = viewport[1];
    // fadeAlpha (offset 72 / float 18)
    f32[18] = fadeAlpha;
    // iTime (offset 76 / float 19)
    f32[19] = iTimeSec;
    // cameraPosWorld (offsets 80..91 / floats 20..22).  vec3 alignment
    // is 16 bytes in the WGSL std140-ish layout, so the field starts
    // at offset 80 (the next multiple of 16 after 76+4=80).  Float 23
    // is the trailing pad and stays zero — the ArrayBuffer init takes
    // care of it.
    f32[20] = cameraPosWorld[0];
    f32[21] = cameraPosWorld[1];
    f32[22] = cameraPosWorld[2];
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6, 1);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
  }
}
