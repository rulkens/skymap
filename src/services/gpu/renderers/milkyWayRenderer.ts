/**
 * milkyWayRenderer — single-quad procedural Milky Way impostor at the
 * world origin.
 *
 * Sibling to `proceduralDiskRenderer.ts` (per-galaxy 3D-oriented
 * impostors) and `texturedQuadRenderer.ts` (textured screen-aligned thumbnails)
 * but with a degenerate cardinality: this pass renders exactly ONE
 * instance per frame.  No per-galaxy vertex buffer, no instancing —
 * just a six-vertex `draw(6, 1)` call.
 *
 * The GPU side is a hand port of a CC0 ShaderToy "Spiral galaxy"
 * fragment shader.  See `shaders/milkyWay/{io,vertex,fragment}.wesl`
 * for the WESL source and the per-line port notes — the procedural-
 * galaxy helpers (stars, height, galaxyNormal, shadeGalaxyDisk,
 * renderGalaxy) all live alongside `fs` in `fragment.wesl` because
 * they're fragment-only.
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
 *   offset 96  | f32 × 4     _pad            — tail pad; round struct up to 112 B
 *
 * #### Why the field order changed (vs the pre-WESL-conversion layout)
 *
 * The previous layout placed `fadeAlpha` at offset 72, which collides
 * with the `_pad0/_pad1` slots that `CameraUniforms` reserves. To embed
 * `cam: CameraUniforms` as the first field we had to relocate the
 * renderer-specific scalars after the cam block. `cameraPosWorld` (vec3,
 * 16-byte alignment) lands naturally at offset 80 — the first 16-byte
 * boundary after cam — and `fadeAlpha` falls in at 92. CPU-side:
 * `fadeAlpha` moved from f32 index 18 → 23, `cameraPosWorld` stays at
 * 20..22.
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
 *
 * ### Factory shape (Spec F.1)
 *
 * Exposed as `createMilkyWayRenderer(init): MilkyWayRenderer` and the
 * matching type alias.  The pre-Spec-F revision shipped this as
 * `class MilkyWayRenderer` with a `static UNIFORM_BUFFER_SIZE`
 * constant; the static lifts to a module-level `export const
 * MILKY_WAY_UNIFORM_BUFFER_SIZE`.  Tests pin it directly via the
 * named export.  Public method surface (`draw`, `destroy`) is
 * byte-identical with the class form.
 */

// Two ?static imports mirror the points/* split (Task 13): each
// pipeline stage compiles its own GPUShaderModule from a strictly-
// smaller source. The vertex module pulls in 'lib/camera' for
// 'worldToClip'; the fragment module pulls in 'lib/math' + 'lib/util'
// for the procedural-galaxy helpers. Sharing modules across pipelines
// would invite the WebGPU 'auto' bind-group-layout trap — sidestepped
// here by giving each stage its own module from disjoint sources.
import { mat4 } from 'wgpu-matrix';
import vsCode from '../shaders/milkyWay/vertex.wesl?static';
import fsCode from '../shaders/milkyWay/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { MilkyWayRenderer } from '../../../@types/rendering/MilkyWayRenderer';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';

type Init = {
  device: GPUDevice;
  format: GPUTextureFormat;
};

/**
 * Public constant pinning the on-the-wire uniform buffer size.  Must
 * match the WESL `Uniforms` struct's std140-ish layout
 * (`CameraUniforms` 80 B + vec3 cameraPosWorld 12 B + 2 × f32 8 B +
 * 12 B tail pad = 112 bytes) byte-for-byte.  Changing one without
 * the other yields silent uniform-read corruption.
 *
 * Lifted from a class static (`MilkyWayRenderer.UNIFORM_BUFFER_SIZE`)
 * to a module-level export as part of the Spec F.1 factory conversion.
 * Tests pin this directly via named import.
 */
export const MILKY_WAY_UNIFORM_BUFFER_SIZE = 112;

export function createMilkyWayRenderer(init: Init): MilkyWayRenderer {
  const { device, format } = init;

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'milkyWay.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'milkyWay.fragment');

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'milkyWay-bgl-uniforms',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const uniformBuffer = device.createBuffer({
    label: 'milkyWay-uniform-buffer',
    size: MILKY_WAY_UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    label: 'milkyWay-bg-uniforms',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'milkyWay-pipeline-layout',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    label: 'milkyWay-pipeline',
    layout: pipelineLayout,
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
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

  // Scratch matrix reused per frame for the `viewProj × translate(centerWorld)`
  // pre-bake (see `draw` below).  Allocated once at factory time so the per-
  // frame draw doesn't churn the GC.  Only meaningful when `centerWorld` is
  // non-zero, but cheap enough to compute unconditionally.
  const scratchVp = mat4.create();

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: Vec2,
    fadeAlpha: number,
    cameraPosWorld: Readonly<Vec3>,
    centerWorld: Vec3 = [0, 0, 0],
  ): void {
    // ── CPU-side reframing for off-origin rendering ────────────────────
    //
    // The impostor's vertex+fragment shaders are written assuming the
    // galactic center sits at world (0, 0, 0).  We don't want to edit
    // them every time the impostor's anchor moves, so we instead pre-
    // bake the offset into the two uniform values that drive the
    // shader's spatial reasoning:
    //
    //   modVp     = viewProj × translate(centerWorld)
    //   shiftedCP = cameraPosWorld − centerWorld
    //
    // With these, a vertex worldPos `p` (which the shader still
    // computes around its conceptual origin) projects through
    // `modVp · (p, 1) = viewProj · translate(centerWorld) · (p, 1) =
    // viewProj · (p + centerWorld, 1)` — i.e. the billboard appears
    // at world `centerWorld + p`, exactly where we want it.
    //
    // The fragment stage's `worldToGalactic(cameraPosWorld)` math
    // assumes camera position is already relative to the galactic
    // center.  Subtracting `centerWorld` from `cameraPosWorld` makes
    // that assumption true: the rotation into the galactic axis
    // frame now correctly describes the camera's position relative
    // to Sgr A\* rather than relative to Earth.
    //
    // Net cost: one mat4 multiply + three subtractions per frame; no
    // shader bytes touched.  For `centerWorld = [0, 0, 0]` (the
    // default), the translation is identity and `shiftedCP =
    // cameraPosWorld`, so back-compat with the pre-offset call sites
    // is exact.
    mat4.translate(viewProj, centerWorld, scratchVp);
    const shiftedCamX = cameraPosWorld[0] - centerWorld[0];
    const shiftedCamY = cameraPosWorld[1] - centerWorld[1];
    const shiftedCamZ = cameraPosWorld[2] - centerWorld[2];

    // Pack uniforms into a 112-byte ArrayBuffer matching the WESL
    // `Uniforms` struct layout.  See the module doc-comment for the
    // full offset table.
    const uniforms = new ArrayBuffer(MILKY_WAY_UNIFORM_BUFFER_SIZE);
    const f32 = new Float32Array(uniforms);
    // cam.viewProj — mat4 (offsets 0..63 / floats 0..15).  Pre-baked
    // with the centerWorld translation per the comment block above.
    f32.set(scratchVp, 0);
    // cam.viewportPx — vec2 (offsets 64..71 / floats 16..17).  Unread
    // by this pass but uploaded for ABI symmetry with the rest of the
    // engine (every other renderer reads viewportPx for pxPerRad-style
    // derivations).
    f32[16] = viewport[0];
    f32[17] = viewport[1];
    // cam._pad0/_pad1 (offsets 72..79 / floats 18..19) — reserved by
    // CameraUniforms.  Stays zero (ArrayBuffer init handles it).
    // cameraPosWorld — vec3 (offsets 80..91 / floats 20..22), shifted
    // by `centerWorld` so the fragment's galactic-frame math (which
    // assumes the galactic center sits at the camera's "0 vector")
    // reads correctly.  See the comment block above.
    f32[20] = shiftedCamX;
    f32[21] = shiftedCamY;
    f32[22] = shiftedCamZ;
    // fadeAlpha (offset 92 / float 23) — sits in the f32 slot
    // immediately after the vec3, packing the vec3+f32 quad into
    // bytes 80..95.
    f32[23] = fadeAlpha;
    // Floats 24..27 are tail padding (offsets 96..111) rounding
    // the struct size up to a 16-byte multiple.  Stays zero.
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, 1);
  }

  function destroy(): void {
    uniformBuffer.destroy();
  }

  const renderer: MilkyWayRenderer = {
    label: 'milkyWayRenderer',
    draw,
    destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
