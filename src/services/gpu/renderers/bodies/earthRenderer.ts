/**
 * earthRenderer — true-scale, texture-mapped Earth drawn into the opaque
 * near-field foreground target.
 *
 * The geometry is the same UV sphere every body renderer uses
 * (`uvSphereMesh`), shaded by sampling an equirectangular Blue Marble
 * bitmap. It shares `lib/sphere.wesl`'s uniform (`SphereUniforms`, a 64-byte
 * mat4x4<f32> MVP) and the `clip_from_local` projection helper with the
 * star/planet renderers, so the CPU-side matrix layout and the GPU-side
 * projection stay a single source of truth.
 *
 * **Precondition — draw at most once per frame:** `draw` writes the MVP into a
 * single non-dynamic uniform buffer before issuing the indexed draw, so a
 * second same-frame `draw` with a different MVP would race `queue.writeBuffer`
 * against the pending `queue.submit` and render both spheres with whichever
 * matrix won — the caller must issue exactly one Earth draw per frame.
 *
 * ### Untextured behaviour (placeholder texture)
 *
 * The Blue Marble bitmap is fetched asynchronously by the engine (the NEXT
 * task), so at construction there is nothing to sample. Rather than branch the
 * fragment shader on a "has-texture" flag, the renderer creates a 1×1
 * mid-blue `rgba8unorm-srgb` texture at construction and binds THAT. The
 * fragment shader always samples a real texture; before the bitmap lands it
 * simply reads back a uniform mid-blue, so the Earth is visible-but-plain
 * (a plain blue ball) rather than black or absent. When `setTexture(bitmap)`
 * runs it creates a fresh texture sized to the bitmap, uploads it, and rebuilds
 * the fragment bind group to point at the new view.
 *
 * ### uv / texture orientation
 *
 * `uvSphereMesh` emits v south-to-north (v=0 south pole, v=1 north pole).
 * Equirectangular Blue Marble imagery stores the north pole in its top row, so
 * the bitmap is uploaded with `flipY: true` — texture v=0 becomes the image's
 * bottom (south) row, matching the mesh's south-first v. So v needs no remap.
 *
 * u needs no remap either. The mesh places longitude on +Y (the equatorial
 * J2000 frame, pole on +Z), so increasing u winds CCW as seen from outside the
 * sphere — matching an equirectangular map's east-increases-left-to-right
 * convention, and the raw u draws the continents in the correct orientation.
 * See `earth/fragment.wesl` for the two-vertex derivation. The sampler still
 * uses `repeat` addressing on u so the mesh's duplicated seam column wraps
 * cleanly across the longitude seam.
 *
 * ### Pipeline state
 *
 * Colour target: the caller's `targetFormat` (the foreground:0 row's
 * `rgba16float`). Depth: the caller's `depthFormat` (`depth32float`) with
 * `depthWriteEnabled: true` + `depthCompare: 'less'` so the Earth occludes /
 * is occluded correctly. Front face CCW + `cull: 'back'` matches
 * `uvSphereMesh`'s outward winding. No blend descriptor = opaque replace; the
 * fragment emits alpha=1 and the foreground composite handles layer blending.
 *
 * ### Bind group layout
 *
 * An explicit `bindGroupLayout` (not `layout: 'auto'`) so the texture swap in
 * `setTexture` can rebuild a bind group against a stable layout object, and to
 * avoid the auto-layout trap documented in `feedback_webgpu_auto_layout_trap`.
 * Binding 0: `SphereUniforms` (vertex). Binding 1: sampler (fragment).
 * Binding 2: the 2D Earth texture (fragment).
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { EarthRenderer } from '../../../../@types/rendering/EarthRenderer';
import { uvSphereMesh } from '../../../../utils/math/uvSphereMesh';
import vsCode from '../../shaders/earth/vertex.wesl?static';
import fsCode from '../../shaders/earth/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

/** UV-sphere tessellation counts — 48 segments × 24 rings gives a smooth
 *  silhouette at close range without overwhelming the vertex throughput.
 *  Matches `starRenderer` / `planetRenderer` so every sphere body shares a
 *  mesh shape. */
const SEGMENTS = 48;
const RINGS = 24;

/** `SphereUniforms` contains one mat4x4<f32> — 16 floats × 4 bytes. */
const UNIFORM_BUFFER_SIZE = 64;

export function createEarthRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
): EarthRenderer {
  // ── Geometry upload ───────────────────────────────────────────────────────
  //
  // Both the positions and the uvs are uploaded (the untextured star/planet
  // renderers skip uvs).
  // They go into two tightly-packed VBOs — positions (f32x3, stride 12) at
  // slot 0, uvs (f32x2, stride 8) at slot 1 — matching the two vertex-buffer
  // layouts declared on the pipeline. Two separate buffers (rather than one
  // interleaved) mirror `uvSphereMesh`'s two output arrays with no repack.
  const mesh = uvSphereMesh(SEGMENTS, RINGS);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'earth-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const uvBuffer = device.createBuffer({
    label: 'earth-uv-vbo',
    size: mesh.uvs.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uvBuffer, 0, mesh.uvs);

  const indexBuffer = device.createBuffer({
    label: 'earth-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  // ── Uniform buffer (one MVP) ──────────────────────────────────────────────
  //
  // A single Earth is drawn per frame, so one 64-byte `SphereUniforms`
  // block suffices — no multi-slot dynamic-offset buffer needed. `draw`
  // writes the MVP here before issuing the indexed draw.
  const uniformBuffer = device.createBuffer({
    label: 'earth-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Sampler ───────────────────────────────────────────────────────────────
  //
  // Linear filtering for a smooth surface. `repeat` on u lets the duplicated
  // seam column blend across the longitude wrap; `clamp-to-edge` on v avoids
  // sampling past the poles.
  const sampler = device.createSampler({
    label: 'earth-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
  });

  // ── Placeholder texture ───────────────────────────────────────────────────
  //
  // A 1×1 mid-blue texel stands in until the Blue Marble bitmap arrives via
  // `setTexture`. Binding a real texture at all times means the fragment shader
  // never needs a "has-texture" branch — it always samples, and before the
  // bitmap lands it reads this uniform blue. `rgba8unorm-srgb` matches the
  // real Earth texture so the hardware linearises identically in both cases.
  let texture = device.createTexture({
    label: 'earth-placeholder-texture',
    size: [1, 1, 1],
    format: 'rgba8unorm-srgb',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    // Mid-blue, opaque. sRGB-encoded byte values — the texture format
    // linearises them on sample.
    new Uint8Array([70, 110, 160, 255]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    [1, 1, 1],
  );

  // ── Bind group layout (explicit, not 'auto') ──────────────────────────────
  //
  // Binding 0: `SphereUniforms`, vertex stage only.
  // Binding 1: the sampler, fragment stage.
  // Binding 2: the 2D Earth texture, fragment stage (filterable f32).
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'earth-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
    ],
  });

  // The bind group references the current `texture` view. `setTexture` rebuilds
  // it against a fresh texture, so it lives in a mutable closure slot.
  function buildBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'earth-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() },
      ],
    });
  }
  let bindGroup = buildBindGroup();

  // ── Shader modules ────────────────────────────────────────────────────────
  //
  // `createShaderModuleWithDevLog` prints the linked WGSL + getCompilationInfo
  // errors in dev so a WESL-import failure is diagnosable rather than a generic
  // "createShaderModule failed".
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'earth.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'earth.fragment');

  // ── Render pipeline ───────────────────────────────────────────────────────
  const pipeline = device.createRenderPipeline({
    label: 'earth-pipeline',
    layout: device.createPipelineLayout({
      label: 'earth-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 12, // 3 × f32 position
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
        {
          arrayStride: 8, // 2 × f32 uv
          attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // No blend descriptor = opaque replace; the fragment emits alpha=1
          // and the foreground composite blends the whole layer.
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // CCW = outward-facing (matches uvSphereMesh winding)
      cullMode: 'back', // discard inward-facing (inner-surface) triangles
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // ── setTexture ─────────────────────────────────────────────────────────────

  function setTexture(bitmap: ImageBitmap): void {
    // Retire the previous texture (placeholder or a prior bitmap) and create a
    // fresh one sized to the incoming bitmap.
    texture.destroy();
    texture = device.createTexture({
      label: 'earth-texture',
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm-srgb',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // flipY:true so texture v=0 is the image's bottom (south) row, matching the
    // mesh's south-first v — see the module header's orientation note.
    device.queue.copyExternalImageToTexture({ source: bitmap, flipY: true }, { texture }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    // Rebuild the bind group against the new texture view.
    bindGroup = buildBindGroup();
  }

  // ── draw ────────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, mvp: Float32Array): void {
    device.queue.writeBuffer(uniformBuffer, 0, mvp);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, uvBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount);
  }

  // ── destroy ──────────────────────────────────────────────────────────────

  function destroy(): void {
    positionBuffer.destroy();
    uvBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
    texture.destroy();
  }

  const renderer: EarthRenderer = {
    label: 'earthRenderer',
    setTexture,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
