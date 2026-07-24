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
 * `EarthSurfaceUniforms` (a 128-byte block: the 80-byte `LitBodyUniforms` prefix
 * — MVP + body-local sun direction — followed by the camera position in the
 * body's local frame and the PBR params `roughnessBase`/`f0`/`sunIrradiance`/
 * `cloudShadowStrength`/`oceanRoughness`) and the `clip_from_local` projection helper with the
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
 * sphere until the real map arrives. A third 1×1 BLACK `rgba8unorm-srgb`
 * placeholder stands in for the Black Marble night map so the emissive
 * city-lights term contributes nothing (the dark side is lit only by `AMBIENT`)
 * until `setMap('night', …)` lands. A fourth 1×1 FLAT-NORMAL `rgba8unorm` LINEAR
 * placeholder (`[128,128,255,255]` → tangent-space `(0,0,1)`) stands in for the
 * normal map so the shading normal equals the geometric normal — no relief —
 * until `setMap('normal', …)` lands. A fifth 1×1 TRANSPARENT `rgba8unorm-srgb`
 * placeholder (`[0,0,0,0]`) stands in for the cloud map so its alpha reads 0 →
 * the surface fragment's ground shadow and night occlusion (both keyed on cloud
 * alpha) contribute nothing until `setMap('clouds', …)` lands. All five
 * placeholder FORMATS derive from the one `isLinearTextureKind` predicate (only
 * the placeholder COLOUR is per-kind), so a placeholder can never disagree with
 * the real map that later shadows it. When
 * `setMap('surface'|'material'|'night'|'normal'|'clouds', …)` runs it creates a
 * fresh texture sized to the bitmap (format chosen by that same
 * `isLinearTextureKind`), uploads it, generates mips, and rebuilds the fragment
 * bind group to point at the new view. Every `TextureKind` is now wired — no kind
 * is inert.
 *
 * The placeholder for a kind is itself upgradable: `setPlaceholderMap(kind,
 * atlas, rect)` crops one tile out of the shared low-resolution all-bodies atlas
 * — the first asset to land at boot — over that kind's 1×1, so an Earth reached
 * before the multi-megabyte Blue Marble arrives shows a recognisable low-res
 * Earth rather than a featureless blue ball. Only `'surface'` has a tile.
 *
 * The two setters write two DIFFERENT maps (`committed` and `placeholders`), and
 * that is the entire out-of-order-arrival story: neither can free the other's
 * texture, so a tile that arrives after the hi-res map cannot clobber it and no
 * commit path has to ask which one landed first.
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
 * `depthWriteEnabled: true` + `depthCompare: 'greater'` (the NEAR0 slab's reversed-Z
 * convention — clear `0.0`, greater-z-wins) so the Earth occludes /
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
 * Binding 4: the 2D night (Black Marble city-lights) texture (fragment).
 * Binding 5: the 2D tangent-space normal (relief) texture (fragment).
 * Binding 6: the 2D cloud (coverage-in-alpha) texture (fragment) — sampled for
 * the surface's cloud ground shadow + night-light occlusion.
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
import type { AtlasTileRect } from '../../../../@types/data/AtlasTileRect';
import type { TextureKind } from '../../../../@types/data/TextureKind';
import { cubeSphereMesh } from '../../../../utils/math/cubeSphereMesh';
import { generateMipChain, mipLevelCount } from '../../lib/generateMipChain';
import { isLinearTextureKind } from '../../../../utils/scene/isLinearTextureKind';
import { EARTH_SURFACE_UNIFORM_FLOATS } from '../../../../utils/gpu/packEarthSurfaceUniforms';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
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

/** `EarthSurfaceUniforms` is 128 bytes (32 f32): the 80-byte `LitBodyUniforms`
 *  prefix (mat4x4<f32> MVP + body-local sun direction, with `roughnessBase`
 *  filling the sun-dir vec3 tail) followed by `camPosLocal` (vec3), `f0`,
 *  `sunIrradiance`, `cloudShadowStrength`, `cloudShellRadius`, `ambientLight`,
 *  `oceanRoughness`, and three zeroed pad floats. Size derives from the packer's
 *  f32 count (× 4 bytes) so this can never drift from the layout it writes.
 *  Written from `packEarthSurfaceUniforms`. */
const UNIFORM_BUFFER_SIZE = EARTH_SURFACE_UNIFORM_FLOATS * 4;

/**
 * Per-kind map config — the one place a `TextureKind` is tied to a bind-group
 * binding and a 1×1 placeholder texel. The bind-group layout, the placeholder
 * textures, and the bind group are all derived by iterating these rows, so each
 * binding number exists once rather than being restated at all three sites (and
 * `setMap` needs no per-kind branch at all). Mirrors `texturedBodyRenderer`'s
 * `KIND_CFG`.
 *
 * The FORMAT is deliberately not a row: it comes from `isLinearTextureKind(kind)`,
 * the same predicate `setMap` uses for the real texture, so a placeholder can
 * never allocate a format the real map contradicts. Bindings 0 (uniform) and 1
 * (sampler) are fixed and hand-written; only the map bindings live here.
 *
 * Typed as a total `Record<TextureKind, …>` rather than a `Partial`: Earth binds
 * every kind in the union, so a new kind is a compile error here until it gets a
 * binding — which is the reminder you want, because the fragment shader needs a
 * matching `@binding` anyway.
 */
const KIND_CFG = {
  // Mid-blue, opaque — a visible-but-plain sphere until the Blue Marble lands.
  surface: { binding: 2, placeholder: [70, 110, 160, 255] },
  // roughness=1 (R), ocean mask=0 (G) → matte, glint-free until the map lands.
  material: { binding: 3, placeholder: [255, 0, 0, 255] },
  // Black → no emissive city-lights term; the dark side is lit only by `AMBIENT`.
  night: { binding: 4, placeholder: [0, 0, 0, 255] },
  // Flat tangent-space normal: RG=128 → nxy=(0,0), so nz reconstructs to 1 → the
  // shading normal equals the geometric normal → no relief until the map lands.
  normal: { binding: 5, placeholder: [128, 128, 255, 255] },
  // Transparent → cloud alpha reads 0, so the surface fragment's ground shadow
  // and night occlusion (both keyed on cloud alpha) stay inert until the Blue
  // Marble cloud map lands.
  clouds: { binding: 6, placeholder: [0, 0, 0, 0] },
} as const satisfies Record<
  TextureKind,
  { binding: number; placeholder: readonly [number, number, number, number] }
>;

/** Every `TextureKind`, in `KIND_CFG` declaration order — the iteration order for
 *  the layout entries, the placeholder textures, and the bind group. */
const MAP_KINDS = Object.keys(KIND_CFG) as TextureKind[];

/** Concatenate the six whole level-0 cube-sphere faces into one indexed mesh.
 *  Each `cubeSphereMesh` call builds a single face tile, so we sum the six
 *  faces' vertex/index counts, then copy each face's positions/uvs/tangents
 *  end-to-end and re-base its indices by the running vertex count so they
 *  address the merged position array. Sizes aren't known up-front (per-triangle
 *  seam duplication appends a variable handful of vertices), hence the two-pass
 *  measure-then-fill. The tangents (the mesh's unit +u=east direction) ride the
 *  same layout as positions — one f32x3 per vertex — and feed Plan C's
 *  tangent-space normal mapping. */
function concatCubeSphereFaces(resolution: number): {
  positions: Float32Array;
  uvs: Float32Array;
  tangents: Float32Array;
  indices: Uint32Array;
} {
  const faces: ReturnType<typeof cubeSphereMesh>[] = [];
  for (let face = 0; face < 6; face++) {
    faces.push(cubeSphereMesh(face, 0, 0, 0, resolution));
  }

  let totalPos = 0;
  let totalUv = 0;
  let totalTan = 0;
  let totalIdx = 0;
  for (const f of faces) {
    totalPos += f.positions.length;
    totalUv += f.uvs.length;
    totalTan += f.tangents.length;
    totalIdx += f.indices.length;
  }

  const positions = new Float32Array(totalPos);
  const uvs = new Float32Array(totalUv);
  const tangents = new Float32Array(totalTan);
  const indices = new Uint32Array(totalIdx);

  let posOff = 0;
  let uvOff = 0;
  let tanOff = 0;
  let idxOff = 0;
  let vertexBase = 0; // running vertex count = index rebase offset for this face
  for (const f of faces) {
    positions.set(f.positions, posOff);
    uvs.set(f.uvs, uvOff);
    tangents.set(f.tangents, tanOff);
    for (let k = 0; k < f.indices.length; k++) {
      indices[idxOff + k] = (f.indices[k] as number) + vertexBase;
    }
    posOff += f.positions.length;
    uvOff += f.uvs.length;
    tanOff += f.tangents.length;
    idxOff += f.indices.length;
    vertexBase += f.positions.length / 3;
  }

  return { positions, uvs, tangents, indices };
}

/**
 * @param reversedZ selects this slab's depth convention (single-sourced in
 *   `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
 *   `true` ⇒ reversed-Z greater-wins. Resolved through `resolveDepthCompare`.
 */
export function createEarthRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): EarthRenderer {
  // ── Geometry upload ───────────────────────────────────────────────────────
  //
  // The positions, uvs, and tangents are uploaded (the untextured star/planet
  // renderers skip uvs + tangents).
  // They go into three tightly-packed VBOs — positions (f32x3, stride 12) at
  // slot 0, uvs (f32x2, stride 8) at slot 1, tangents (f32x3, stride 12) at
  // slot 2 — matching the three vertex-buffer layouts declared on the pipeline.
  // Three separate buffers (rather than one interleaved) mirror the mesh's three
  // output arrays with no repack.
  //
  // `cubeSphereMesh` builds ONE face tile per call, so the six whole level-0
  // faces are concatenated here into a single indexed mesh: positions, uvs, and
  // tangents are appended end-to-end, and each face's indices are offset by the
  // running vertex count so they address the concatenated position array. The
  // tangents (the mesh's unit +u=east direction) feed the fragment's tangent-space
  // normal mapping (Plan C).
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

  // Tangent VBO (slot 2): the mesh's unit +u=east tangent, one f32x3 per vertex.
  // The fragment Gram-Schmidt-re-orthonormalizes it per-fragment and builds the
  // tangent-space basis for the normal-map perturbation.
  const tangentBuffer = device.createBuffer({
    label: 'earth-tangent-vbo',
    size: mesh.tangents.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(tangentBuffer, 0, mesh.tangents);

  const indexBuffer = device.createBuffer({
    label: 'earth-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  // ── Uniform buffer (one Earth-surface record) ─────────────────────────────
  //
  // A single Earth is drawn per frame, so one 128-byte `EarthSurfaceUniforms`
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

  // ── The two per-kind texture layers ───────────────────────────────────────
  //
  // `placeholders` holds one 1×1 texture per kind, alive from construction to
  // teardown. `committed` holds the real map for a kind once `setMap` uploads
  // one, and `buildBindGroup` prefers it. Keeping the placeholder alive under the
  // committed map (rather than overwriting a single cell) is what makes arrival
  // order irrelevant — see the module header.
  //
  // Surface/night/clouds are sRGB colour (`rgba8unorm-srgb`, hardware de-gammas
  // on read); material/normal are linear-packed DATA (`rgba8unorm`, raw numeric
  // channels). That axis lives entirely in `isLinearTextureKind`.
  const placeholders = new Map<TextureKind, GPUTexture>();
  for (const kind of MAP_KINDS) {
    const placeholder = device.createTexture({
      label: `earth-placeholder-${kind}`,
      size: [1, 1, 1],
      format: isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: placeholder },
      new Uint8Array(KIND_CFG[kind].placeholder),
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, 1],
    );
    placeholders.set(kind, placeholder);
  }

  const committed = new Map<TextureKind, GPUTexture>();

  // ── Bind group layout (explicit, not 'auto') ──────────────────────────────
  //
  // Binding 0: `EarthSurfaceUniforms`, VERTEX (mvp) + FRAGMENT (sun dir, camera,
  //            material knobs).
  // Binding 1: the sampler, fragment stage (shared by all five textures).
  // Bindings 2–6: the map textures, fragment stage (filterable f32) — albedo,
  //            material (roughness/ocean-mask), night (Black Marble city
  //            lights), tangent-space normal (relief), and cloud
  //            (coverage-in-alpha, sampled by the surface for its ground shadow +
  //            night occlusion). Derived from `KIND_CFG`, which is where those
  //            numbers live; they must match the fragment's `@binding`s.
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
      ...MAP_KINDS.map((kind) => ({
        binding: KIND_CFG[kind].binding,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const },
      })),
    ],
  });

  // Resolve every map binding as committed-over-placeholder. `setMap` rebuilds
  // the group against a fresh texture, so it lives in a mutable closure slot.
  function buildBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'earth-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        ...MAP_KINDS.map((kind) => ({
          binding: KIND_CFG[kind].binding,
          resource: (committed.get(kind) ?? placeholders.get(kind)!).createView(),
        })),
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
        {
          arrayStride: 12, // 3 × f32 tangent (unit +u=east)
          attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }],
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
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  // ── setMap ─────────────────────────────────────────────────────────────────

  function setMap(kind: TextureKind, bitmap: ImageBitmap): void {
    // Every `TextureKind` has a `KIND_CFG` row: plan A the `surface` (day albedo)
    // + `material` (roughness/ocean-mask) maps, plan B the `night` (Black Marble
    // city-lights) map, plan C the `normal` (tangent-space relief) map, and plan D
    // the `clouds` (coverage-in-alpha) map the surface samples for its ground
    // shadow + night occlusion. No kind is inert, so there is no early-return
    // guard.

    // sRGB colour (surface/night/clouds) samples through `rgba8unorm-srgb` so the
    // hardware de-gammas on read; linear-packed data (material/normal) samples
    // through plain `rgba8unorm` so its numeric channels (roughness, ocean mask,
    // tangent-space normal) are read raw, not gamma-shifted. `isLinearTextureKind`
    // is the single home for that axis — shared with the fetcher's decode path and
    // the filename helper — so the sRGB-vs-linear decision can never drift between
    // the consumers.
    const format: GPUTextureFormat = isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb';
    const levels = mipLevelCount(bitmap.width, bitmap.height);
    const fresh = device.createTexture({
      label: `earth-${kind}`,
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
    // Retire ONLY a prior committed texture of this kind — never the placeholder,
    // which stays alive under the committed layer for the whole renderer
    // lifetime. That is the out-of-order-arrival protection: a late low-resolution
    // tile lands in `committed` and supersedes its predecessor, and no arrival
    // order can leave a binding pointing at a destroyed texture.
    committed.get(kind)?.destroy();
    committed.set(kind, fresh);
    bindGroup = buildBindGroup();
  }

  // ── setPlaceholderMap ─────────────────────────────────────────────────────
  //
  // Upgrade ONE kind's stand-in from its 1×1 to a tile of the shared
  // low-resolution body atlas. Structurally `setMap`, with two differences that
  // carry the whole design: the texture lands in `placeholders` rather than
  // `committed`, so a committed hi-res map shadows it whichever order the two
  // arrive in; and only `rect` of the source bitmap is copied.
  //
  // The atlas is a TRANSPORT format, not a sampling format. Cropping the tile at
  // upload into an ordinary per-kind texture means no shader change, no layout
  // change, no UV remap, no seam gutters, and no atlas texture bound anywhere —
  // the alternative (bind the atlas and offset UVs in the fragment) would push
  // the packing into WGSL and onto iOS's stricter validation for nothing.

  function setPlaceholderMap(kind: TextureKind, atlas: ImageBitmap, rect: AtlasTileRect): void {
    // Same predicate as `setMap`, deliberately: the tile and the map that later
    // shadows it must agree on sRGB-vs-linear, or the stand-in would shift gamma
    // the moment the hi-res texture lands.
    const format: GPUTextureFormat = isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb';
    const levels = mipLevelCount(rect.w, rect.h);
    const fresh = device.createTexture({
      label: `earth-placeholder-${kind}`,
      size: [rect.w, rect.h, 1],
      format,
      mipLevelCount: levels,
      // As in `setMap`: RENDER_ATTACHMENT is what lets generateMipChain render
      // each level below 0.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // COORDINATE CONVENTION — `origin` and `flipY` INTERACT, and this is the one
    // place a wrong assumption survives every test: the mock device rasterises
    // nothing, so a mirrored or wrong-row crop is green in CI and visibly wrong
    // on screen.
    //
    // `origin` is the minimum corner of the source sub-region in UNFLIPPED source
    // coordinates — top-left origin, y increasing DOWNWARD, unaffected by `flipY`
    // (WebGPU §GPUCopyExternalImageSourceInfo: "The origin option is still
    // relative to the top-left corner of the source image, increasing downward").
    // That is exactly the space `atlasTileRect` computes in. `flipY: true` is then
    // applied to the SELECTED REGION alone — the region's bottom row becomes the
    // destination's first row — so the tile lands with precisely the orientation a
    // standalone `setMap` upload of that same image would have: texture v=0 is the
    // tile's south row, matching the mesh's south-first v.
    //
    // Rejected: cropping a sub-bitmap with `createImageBitmap(atlas, x, y, w, h)`.
    // It sidesteps `origin` entirely, but it is asynchronous — this entry point
    // would have to return a promise, or the crop would move out to its caller —
    // all to avoid an interaction the spec pins normatively.
    device.queue.copyExternalImageToTexture(
      { source: atlas, origin: { x: rect.x, y: rect.y }, flipY: true },
      { texture: fresh },
      [rect.w, rect.h, 1],
    );
    generateMipChain(device, fresh);
    // Retire ONLY the prior PLACEHOLDER for this kind — the construction-time 1×1,
    // or an earlier tile — and never the committed map. Mirror image of `setMap`'s
    // rule above; the pair is what makes arrival order a non-question here, where
    // there is no `clearMap` and nothing is ever evicted.
    placeholders.get(kind)?.destroy();
    placeholders.set(kind, fresh);
    bindGroup = buildBindGroup();
  }

  // ── draw ────────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void {
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, uvBuffer);
    pass.setVertexBuffer(2, tangentBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indexCount);
  }

  // ── destroy ──────────────────────────────────────────────────────────────

  function destroy(): void {
    positionBuffer.destroy();
    uvBuffer.destroy();
    tangentBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
    // Both layers: the committed maps and the placeholders that outlived them.
    // Neither setter frees the other's layer, so teardown is the only place both
    // are released — and the placeholders are worth clearing too now that one of
    // them can be a mipped atlas tile rather than a 1×1.
    for (const texture of committed.values()) texture.destroy();
    for (const placeholder of placeholders.values()) placeholder.destroy();
    committed.clear();
    placeholders.clear();
  }

  const renderer: EarthRenderer = {
    label: 'earthRenderer',
    setMap,
    setPlaceholderMap,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
