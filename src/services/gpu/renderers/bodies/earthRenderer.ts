/**
 * earthRenderer — true-scale, texture-mapped Earth drawn into the opaque
 * near-field foreground target.
 *
 * The geometry is a cube-sphere — the six whole level-0 faces of
 * `cubeSphereMesh` concatenated into one indexed mesh — shaded by sampling an
 * equirectangular Blue Marble bitmap and attenuated by the shared sun-relative
 * Lambert term. Earth switched off the shared `uvSphereMesh` (still used by the
 * distant star/planet renderers) because a UV sphere collapses every longitude
 * into a single vertex at each pole: the cap triangles degenerate and the
 * equirectangular map puckers where the continents smear across the pinch. A
 * cube-sphere subdivides each cube face into a uniform quad grid normalized to
 * the unit sphere, so the silhouette stays even and pole-pinch-free at the
 * close-approach descent — and the `(face, level, tileX, tileY)` parameters set
 * up Plan C's terrain quadtree without a later mesh swap. The mesh keeps
 * J2000 / equirect / CCW parity with `uvSphereMesh`, so the orientation and
 * winding notes below carry over unchanged. The shading is the shared
 * physically-based microfacet core (`lib/pbr.wesl`'s `pbrDirect`): a co-registered
 * LINEAR material map (roughness + ocean mask) drives GGX specular, so the smooth
 * ocean returns a tight sun glint while land stays matte, plus the shared
 * `AMBIENT` floor from `lib/bodyLighting.wesl`. It binds `lib/sphere.wesl`'s
 * `EarthSurfaceUniforms` (a 112-byte block: the 80-byte `LitBodyUniforms` prefix
 * — MVP + body-local sun direction — followed by the camera position in the
 * body's local frame and the PBR params `roughnessBase`/`f0`/`sunIrradiance`/
 * `cloudShadowStrength`) and the `clip_from_local` projection helper with the
 * other sphere renderers, so the CPU-side matrix layout and the GPU-side
 * projection stay a single source of truth. The CPU side packs the uniform
 * through `packEarthSurfaceUniforms`.
 *
 * **Precondition — draw at most once per frame:** `draw` writes the uniforms
 * into a single non-dynamic uniform buffer before issuing the indexed draw, so
 * a second same-frame `draw` with different uniforms would race
 * `queue.writeBuffer` against the pending `queue.submit` and render both
 * spheres with whichever record won — the caller must issue exactly one Earth
 * draw per frame. Earth is a single body, so this holds by construction.
 *
 * ### Untextured behaviour (placeholder texture)
 *
 * The Blue Marble bitmap is fetched asynchronously by the engine's
 * `bodyTextures` slot family (key `'earth:surface'`), so at construction there is
 * nothing to sample. Rather than branch the fragment shader on a "has-texture"
 * flag, the renderer creates a 1×1 mid-blue `rgba8unorm-srgb` texture at
 * construction and binds THAT. The fragment shader always samples a real texture;
 * before the bitmap lands it simply reads back a uniform mid-blue, so the Earth
 * is visible-but-plain (a plain blue ball) rather than black or absent. A second
 * 1×1 LINEAR placeholder (`rgba8unorm`, R=255 G=0 → roughness 1, ocean mask 0)
 * stands in for the material map so the fragment shades a matte, glint-free
 * sphere until the real map arrives. When `setMap('surface', bitmap)` or
 * `setMap('material', bitmap)` runs it creates a fresh texture sized to the
 * bitmap (format chosen by `isLinearTextureKind`), uploads it, generates mips,
 * and rebuilds the fragment bind group to point at the new view. The
 * `night`/`clouds`/`normal` kinds land with plans B/C/D; `setMap` ignores them
 * until then.
 *
 * ### uv / texture orientation
 *
 * `cubeSphereMesh` emits v south-to-north (v=0 south pole, v=1 north pole).
 * Equirectangular Blue Marble imagery stores the north pole in its top row, so
 * the bitmap is uploaded with `flipY: true` — texture v=0 becomes the image's
 * bottom (south) row, matching the mesh's south-first v. So v needs no remap.
 *
 * u needs no remap either. The mesh places longitude on +Y (the equatorial
 * J2000 frame, pole on +Z), so increasing u winds CCW as seen from outside the
 * sphere — matching an equirectangular map's east-increases-left-to-right
 * convention, and the raw u draws the continents in the correct orientation.
 * See `earth/fragment.wesl` for the two-vertex derivation. The sampler still
 * uses `repeat` addressing on u so the mesh's per-triangle seam duplicates wrap
 * cleanly across the longitude seam.
 *
 * ### Pipeline state
 *
 * Colour target: the caller's `targetFormat` (the foreground:0 row's
 * `rgba16float`). Depth: the caller's `depthFormat` (`depth32float`) with
 * `depthWriteEnabled: true` + `depthCompare: 'less'` so the Earth occludes /
 * is occluded correctly. Front face CCW + `cull: 'back'` matches
 * `cubeSphereMesh`'s outward winding. No blend descriptor = opaque replace; the
 * fragment emits alpha=1 and the foreground composite handles layer blending.
 *
 * ### Bind group layout
 *
 * An explicit `bindGroupLayout` (not `layout: 'auto'`) so the texture swap in
 * `setMap` can rebuild a bind group against a stable layout object, and to
 * avoid the auto-layout trap documented in `feedback_webgpu_auto_layout_trap`.
 * Binding 0: `EarthSurfaceUniforms` — visible in BOTH stages (the vertex reads
 * `u.mvp`, the fragment reads the sun direction, camera position, and material
 * knobs). Binding 1: sampler (fragment). Binding 2: the 2D Earth albedo texture
 * (fragment). Binding 3: the 2D material (roughness/ocean-mask) texture (fragment).
 *
 * ### Mip generation
 *
 * `setMap` sizes the Earth texture with a full mip chain
 * (`mipLevelCount(w,h)` levels + `RENDER_ATTACHMENT` usage) and runs
 * `generateMipChain` after upload, and the sampler sets `mipmapFilter: 'linear'`
 * — so the surface stops shimmering as Earth shrinks toward the sub-pixel glint
 * handoff during the descent.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { EarthRenderer } from '../../../../@types/rendering/EarthRenderer';
import type { TextureKind } from '../../../../@types/data/TextureKind';
import { cubeSphereMesh } from '../../../../utils/math/cubeSphereMesh';
import { generateMipChain, mipLevelCount } from '../../lib/generateMipChain';
import { isLinearTextureKind } from '../../../../utils/scene/isLinearTextureKind';
import vsCode from '../../shaders/bodies/earth/vertex.wesl?static';
import fsCode from '../../shaders/bodies/earth/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

/** Per-face grid subdivision for the cube-sphere: each of the six faces is a
 *  `RES × RES` quad grid, so the whole globe is `6 × 48² ≈ 13.8k` quads — about
 *  12× the old 48×24 UV sphere's 1,152 quads, but still trivial for a single
 *  hero-body draw. The extra density buys even, pole-pinch-free tessellation
 *  (no polar vertex singularity) at the close-approach descent, and (per spec
 *  §11) this is a single fixed subdivision with no runtime LOD. A future
 *  terrain LOD can subdivide per-tile via the generator's `(face, level,
 *  tileX, tileY)` addressing without touching this build. */
const CUBESPHERE_FACE_RESOLUTION = 48;

/** `EarthSurfaceUniforms` is 112 bytes (28 f32): the 80-byte `LitBodyUniforms`
 *  prefix (mat4x4<f32> MVP + body-local sun direction, with `roughnessBase`
 *  filling the sun-dir vec3 tail) followed by `camPosLocal` (vec3), `f0`,
 *  `sunIrradiance`, `cloudShadowStrength`, and two zeroed pad floats. The ambient
 *  floor lives in `lib/bodyLighting.wesl`'s `AMBIENT` const, not a uniform field.
 *  Written from `packEarthSurfaceUniforms`. */
const UNIFORM_BUFFER_SIZE = 112;

/** Concatenate the six whole level-0 cube-sphere faces into one indexed mesh.
 *  Each `cubeSphereMesh` call builds a single face tile, so we sum the six
 *  faces' vertex/index counts, then copy each face's positions/uvs end-to-end
 *  and re-base its indices by the running vertex count so they address the
 *  merged position array. Sizes aren't known up-front (per-triangle seam
 *  duplication appends a variable handful of vertices), hence the two-pass
 *  measure-then-fill. Tangents are intentionally dropped — Plan C uploads them
 *  when the normal map is sampled, so emitting a tangent VBO now would leave a
 *  dead vertex buffer + varying. */
function concatCubeSphereFaces(resolution: number): {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
} {
  const faces: ReturnType<typeof cubeSphereMesh>[] = [];
  for (let face = 0; face < 6; face++) {
    faces.push(cubeSphereMesh(face, 0, 0, 0, resolution));
  }

  let totalPos = 0;
  let totalUv = 0;
  let totalIdx = 0;
  for (const f of faces) {
    totalPos += f.positions.length;
    totalUv += f.uvs.length;
    totalIdx += f.indices.length;
  }

  const positions = new Float32Array(totalPos);
  const uvs = new Float32Array(totalUv);
  const indices = new Uint32Array(totalIdx);

  let posOff = 0;
  let uvOff = 0;
  let idxOff = 0;
  let vertexBase = 0; // running vertex count = index rebase offset for this face
  for (const f of faces) {
    positions.set(f.positions, posOff);
    uvs.set(f.uvs, uvOff);
    for (let k = 0; k < f.indices.length; k++) {
      indices[idxOff + k] = (f.indices[k] as number) + vertexBase;
    }
    posOff += f.positions.length;
    uvOff += f.uvs.length;
    idxOff += f.indices.length;
    vertexBase += f.positions.length / 3;
  }

  return { positions, uvs, indices };
}

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
  // interleaved) mirror the mesh's two output arrays with no repack.
  //
  // `cubeSphereMesh` builds ONE face tile per call, so the six whole level-0
  // faces are concatenated here into a single indexed mesh: positions and uvs
  // are appended end-to-end, and each face's indices are offset by the running
  // vertex count so they address the concatenated position array. (The mesh
  // also emits tangents; Plan C uploads them for normal mapping — this task
  // drops them so there is no dead vertex buffer / varying.)
  const mesh = concatCubeSphereFaces(CUBESPHERE_FACE_RESOLUTION);
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

  // ── Uniform buffer (one Earth-surface record) ─────────────────────────────
  //
  // A single Earth is drawn per frame, so one 112-byte `EarthSurfaceUniforms`
  // block suffices — no multi-slot dynamic-offset buffer needed. `draw`
  // writes the packed record (MVP + sunDirLocal + camPosLocal + PBR params) here
  // before issuing the indexed draw.
  const uniformBuffer = device.createBuffer({
    label: 'earth-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Sampler ───────────────────────────────────────────────────────────────
  //
  // Linear filtering for a smooth surface. `mipmapFilter: 'linear'` trilinearly
  // blends the mip chain `setMap` builds, so the surface stops shimmering as
  // Earth shrinks toward the sub-pixel glint handoff. `repeat` on u lets the
  // duplicated seam column blend across the longitude wrap; `clamp-to-edge` on v
  // avoids sampling past the poles.
  const sampler = device.createSampler({
    label: 'earth-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
  });

  // ── Placeholder texture ───────────────────────────────────────────────────
  //
  // A 1×1 mid-blue texel stands in until the Blue Marble bitmap arrives via
  // `setMap`. Binding a real texture at all times means the fragment shader
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

  // ── Placeholder material texture ──────────────────────────────────────────
  //
  // A 1×1 LINEAR (`rgba8unorm`, NO sRGB de-gamma) texel standing in until the
  // real roughness/ocean-mask map arrives via `setMap('material', …)`. The
  // material map packs DATA, not colour: `.r` = roughness, `.g` = ocean mask.
  // R=255 → roughness 1.0 (fully rough, `roughness = roughnessBase`); G=0 → ocean
  // mask off (all land, no glint). So before the real map lands the fragment
  // shades a matte, glint-free sphere — the "still lit, no glint yet" behaviour.
  // Mirrors the surface placeholder so the fragment always samples a real texture
  // at binding 3 without a "has-material" branch.
  let materialTexture = device.createTexture({
    label: 'earth-placeholder-material',
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: materialTexture },
    // roughness=1 (R), ocean mask=0 (G); B/A unused. Linear format — raw bytes.
    new Uint8Array([255, 0, 0, 255]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    [1, 1, 1],
  );

  // ── Bind group layout (explicit, not 'auto') ──────────────────────────────
  //
  // Binding 0: `EarthSurfaceUniforms`, VERTEX (mvp) + FRAGMENT (sun dir, camera,
  //            material knobs).
  // Binding 1: the sampler, fragment stage (shared by both textures).
  // Binding 2: the 2D Earth albedo texture, fragment stage (filterable f32).
  // Binding 3: the 2D material (roughness/ocean-mask) texture, fragment stage.
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'earth-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
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
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
    ],
  });

  // The bind group references the current `texture` + `materialTexture` views.
  // `setMap` rebuilds it against a fresh texture (either binding 2 or 3), so it
  // lives in a mutable closure slot.
  function buildBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'earth-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() },
        { binding: 3, resource: materialTexture.createView() },
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
      frontFace: 'ccw', // CCW = outward-facing (matches cubeSphereMesh winding)
      cullMode: 'back', // discard inward-facing (inner-surface) triangles
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // ── setMap ─────────────────────────────────────────────────────────────────

  function setMap(kind: TextureKind, bitmap: ImageBitmap): void {
    // Plan A wires the `surface` (day albedo) and `material` (roughness/ocean-mask)
    // maps. The `night`/`clouds`/`normal` kinds land with plans B/C/D, which add
    // their cases + GPU bindings here. Those kinds are inert until then.
    if (kind !== 'surface' && kind !== 'material') return;

    // sRGB colour (surface) samples through `rgba8unorm-srgb` so the hardware
    // de-gammas on read; linear-packed data (material) samples through plain
    // `rgba8unorm` so its numeric channels (roughness, ocean mask) are read raw,
    // not gamma-shifted. `isLinearTextureKind` is the single home for that axis —
    // shared with the fetcher's decode path and the filename helper — so the
    // sRGB-vs-linear decision can never drift between the three consumers.
    const format: GPUTextureFormat = isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb';
    const levels = mipLevelCount(bitmap.width, bitmap.height);
    const fresh = device.createTexture({
      label: kind === 'material' ? 'earth-material' : 'earth-texture',
      size: [bitmap.width, bitmap.height, 1],
      format,
      mipLevelCount: levels,
      // RENDER_ATTACHMENT is required: generateMipChain renders each level below
      // 0 as a downsample pass (see its module header).
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // flipY:true so texture v=0 is the image's bottom (south) row, matching the
    // mesh's south-first v — see the module header's orientation note. The
    // material map is co-registered with the albedo, so it takes the same flip
    // and the fragment samples both at one uv.
    device.queue.copyExternalImageToTexture({ source: bitmap, flipY: true }, { texture: fresh }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    // Fill mip levels 1..N-1 so the mipmapFilter:'linear' sampler has a real
    // chain to trilinearly blend as Earth shrinks toward the glint handoff.
    generateMipChain(device, fresh);
    // Retire the previous texture (placeholder or a prior bitmap) in the matching
    // slot and rebuild the bind group against the new view.
    if (kind === 'material') {
      materialTexture.destroy();
      materialTexture = fresh;
    } else {
      texture.destroy();
      texture = fresh;
    }
    bindGroup = buildBindGroup();
  }

  // ── draw ────────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void {
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, uvBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indexCount);
  }

  // ── destroy ──────────────────────────────────────────────────────────────

  function destroy(): void {
    positionBuffer.destroy();
    uvBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
    texture.destroy();
    materialTexture.destroy();
  }

  const renderer: EarthRenderer = {
    label: 'earthRenderer',
    setMap,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
