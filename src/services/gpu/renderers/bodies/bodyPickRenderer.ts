/**
 * bodyPickRenderer — the r32uint pick provider for the NEAR0 foreground bodies
 * (Earth, the planets, and the ~25 seeded scene stars incl. the Sun).
 *
 * It records pickable body geometry into an ALREADY-BEGUN r32uint pick pass
 * (owned by the pick program), stamping each body's caller-packed identity into
 * the texels it covers. Like `starCatalogPickRenderer`, it owns no pass, no
 * texture and no readback — it is one `drawPick` provider among the NEAR0
 * pickable rows.
 *
 * ### Two geometries → two OWN pipelines
 *
 *   - `drawSphere` — ONE body sphere per call (Earth, a planet, a resolved
 *     scene-star sphere), same unit-sphere mesh as the visual sphere bodies.
 *   - `drawPoints` — the sub-pixel scene-star POINT partition as one instanced
 *     draw of pick billboards, each expanded to a generous 18 px footprint (these
 *     ≤25 labelled scene stars are click-invited targets; the survey star pick
 *     keeps its minimal clamp for its dense field — see `starPointPick.wesl`).
 *
 * Each compiles its OWN `GPUShaderModule` + explicit pipeline layout (never a
 * shared module across pipelines — the WebGPU 'auto'-layout trap).
 *
 * ### The writeBuffer-vs-submit trap, applied to `drawSphere`
 *
 * The pick program records every NEAR0 pickable layer's `drawPick` into ONE
 * render pass, then does ONE `queue.submit`. All `queue.writeBuffer` calls made
 * between passes and submit are applied to their buffers BEFORE the GPU runs any
 * command — so if `drawSphere` wrote a SINGLE shared uniform once per call,
 * every recorded sphere draw would read the LAST body's mvp + packedId and all
 * sphere picks would collapse onto the final body.
 *
 * **Mechanism chosen: one uniform buffer + 256-byte-aligned DYNAMIC OFFSETS,
 * with a monotonically-advancing per-pass cursor.** Each `drawSphere` writes its
 * `{ mvp, packedId }` into the cursor's OWN slot and binds it via a dynamic
 * offset, so no two draws in a pass share bytes — the race cannot happen. The
 * cursor resets to 0 the first time a NEW pass object is seen (`beginPassIfNew`),
 * which is the natural per-pass boundary (each `pick()` / `renderForDebug()`
 * begins a fresh `GPURenderPassEncoder`); across passes the slots are reused
 * safely because the prior pass was already submitted.
 *
 * Why dynamic offsets over the sibling patterns:
 *
 *   - The VISUAL `planetRenderer` instances every planet in one draw so each
 *     reads its own baked record — but the pick CONTRACT is one sphere per
 *     call (each body carries its own packed id), so there is no single batch to
 *     instance; a per-draw uniform is the shape the contract names.
 *   - A per-slot BUFFER POOL (one buffer + bind group per draw, grown on demand)
 *     also works and grows safely mid-pass, but costs N buffers + N bind groups;
 *     dynamic offsets need exactly ONE buffer + ONE bind group. The sphere-draw
 *     count is small and statically bounded (Earth 1 + planets <=`MAX_PLANETS` +
 *     scene-star spheres <=`SCENE_STARS.length`, well under `MAX_SPHERE_DRAWS`),
 *     so the single fixed-size buffer never needs to grow — the pool's only
 *     advantage does not arise here.
 *
 * `drawPoints` is instanced (per-instance posRelCamMpc + packedId baked into a
 * per-frame instance buffer), so it dodges the race by construction — every
 * instance reads its OWN record. Its ONE precondition: call it at most once per
 * pass (it rebuilds that instance buffer with one `writeBuffer`, so a second
 * same-pass call would race that write). The single `starPointsLayer` caller
 * honours this; the contract documents it (the `starRenderer` idiom).
 *
 * ### Depth-tested, r32uint, no blend
 *
 * Both pipelines carry the NEAR0 `depth32float` depth profile
 * (`depthCompare: 'less'`, `depthWriteEnabled: true`) so overlapping bodies — a
 * Moon in front of Earth — resolve nearest-wins, matching visual occlusion. The
 * colour target is `r32uint` (integer formats cannot blend; depth resolves
 * overlaps instead), matching the pick program's NEAR0 attachment formats.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type {
  BodyPickRenderer,
  BodySpherePickArgs,
  BodyPointPickArgs,
} from '../../../../@types/rendering/BodyPickRenderer';
import { uvSphereMesh } from '../../../../utils/math/uvSphereMesh';
import spherePickCode from '../../shaders/bodies/spherePick.wesl?static';
import starPointPickCode from '../../shaders/bodies/starPointPick.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { writeCameraPrefix } from '../../lib/cameraUniforms';

/** UV-sphere tessellation — matches the visual sphere bodies so the pick
 *  silhouette is identical to the drawn sphere. */
const SEGMENTS = 48;
const RINGS = 24;

/**
 * `SpherePickUniforms` byte size (spherePick.wesl): mat4x4<f32> (64) + u32 (4),
 * rounded up to the mat4x4's 16-byte alignment = 80. The CPU scratch mirrors it:
 * f32[0..15] = mvp, u32[16] = packedId.
 */
const SPHERE_UNIFORM_BYTES = 80;
/** u32 index of `packedId` in the 80-byte sphere scratch (byte 64 / 4). */
const SPHERE_PACKED_ID_U32_INDEX = 16;

/**
 * Upper bound on sphere pick draws recorded into one pass. The real bound is
 * Earth (1) + planets (<=`MAX_PLANETS` = 24) + resolved scene-star spheres
 * (<=`SCENE_STARS.length` ~= 25) ~= 50; 64 leaves headroom so the fixed-size
 * dynamic-offset buffer never needs to grow. A hypothetical over-count draws the
 * first 64 and silently drops the tail (a dropped-tail pick beats a GPU
 * validation error) — but the seed roster keeps the count well under the cap.
 */
const MAX_SPHERE_DRAWS = 64;

/** `CameraUniforms` byte size (lib/camera.wesl): viewProj (64) + viewportPx (8)
 *  + 2 pad floats (8) = 80. The scene-star point pick binds this per frame. */
const POINT_UNIFORM_BYTES = 80;

/**
 * Per-instance byte stride for the scene-star point pick: posRelCamMpc
 * (float32x3, 12) + packedId (u32, 4) = 16. Byte-exact with the `@location`
 * offsets in starPointPick.wesl.
 */
const POINT_INSTANCE_STRIDE = 16;
/** Float/word count per instance (3 f32 + 1 u32). */
const POINT_INSTANCE_WORDS = 4;

export function createBodyPickRenderer(device: GPUDevice): BodyPickRenderer {
  // ── Shared sphere geometry (positions + indices; no uvs — the pick fragment
  //    samples nothing) ────────────────────────────────────────────────────
  const mesh = uvSphereMesh(SEGMENTS, RINGS);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'body-pick-sphere-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const indexBuffer = device.createBuffer({
    label: 'body-pick-sphere-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  // ── Sphere pick pipeline (dynamic-offset per-draw uniform) ────────────────
  //
  // One 256-byte-aligned slot per draw. `slotStride` is the device's minimum
  // uniform-buffer offset alignment (256 on every current backend), the coarsest
  // granularity a dynamic offset may take. The struct is only 80 B, so most of
  // each slot is unused padding — the alignment tax dynamic offsets levy, cheap
  // at <=64 slots (16 KB total).
  const slotStride = device.limits.minUniformBufferOffsetAlignment;
  const sphereUniformBuffer = device.createBuffer({
    label: 'body-pick-sphere-uniform',
    size: MAX_SPHERE_DRAWS * slotStride,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // One 80-byte ArrayBuffer viewed as both f32 (mvp) and u32 (packedId),
  // rewritten per draw and uploaded into the cursor's slot.
  const sphereScratch = new ArrayBuffer(SPHERE_UNIFORM_BYTES);
  const sphereScratchF32 = new Float32Array(sphereScratch);
  const sphereScratchU32 = new Uint32Array(sphereScratch);

  const sphereBgl = device.createBindGroupLayout({
    label: 'body-pick-sphere-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: SPHERE_UNIFORM_BYTES },
      },
    ],
  });
  // Bound to the FIRST slot's worth of bytes; the dynamic offset shifts the
  // window to the active slot per draw.
  const sphereBindGroup = device.createBindGroup({
    label: 'body-pick-sphere-bg',
    layout: sphereBgl,
    entries: [
      {
        binding: 0,
        resource: { buffer: sphereUniformBuffer, offset: 0, size: SPHERE_UNIFORM_BYTES },
      },
    ],
  });

  const sphereModule = createShaderModuleWithDevLog(device, spherePickCode, 'bodyPick.spherePick');
  const spherePipeline = device.createRenderPipeline({
    label: 'body-pick-sphere-pipeline',
    layout: device.createPipelineLayout({
      label: 'body-pick-sphere-pipeline-layout',
      bindGroupLayouts: [sphereBgl],
    }),
    vertex: {
      module: sphereModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 12, // 3 × f32 position (per-vertex)
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
      ],
    },
    fragment: {
      module: sphereModule,
      entryPoint: 'fsPick',
      // r32uint: no blend (integer formats can't be blended). Depth resolves
      // overlapping spheres instead.
      targets: [{ format: 'r32uint' }],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // matches uvSphereMesh winding + the visual sphere bodies
      cullMode: 'back',
    },
    // NEAR0 depth profile — see module header (Moon-in-front-of-Earth resolves).
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // ── Scene-star point pick pipeline (instanced billboards) ─────────────────
  const pointUniformBuffer = device.createBuffer({
    label: 'body-pick-point-uniform',
    size: POINT_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // 20-float scratch: writeCameraPrefix fills [0..17]; [18..19] stay 0 pads.
  const pointUniformScratch = new Float32Array(POINT_UNIFORM_BYTES / 4);

  const pointBgl = device.createBindGroupLayout({
    label: 'body-pick-point-bgl',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const pointBindGroup = device.createBindGroup({
    label: 'body-pick-point-bg',
    layout: pointBgl,
    entries: [{ binding: 0, resource: { buffer: pointUniformBuffer } }],
  });

  const pointModule = createShaderModuleWithDevLog(
    device,
    starPointPickCode,
    'bodyPick.starPointPick',
  );
  const pointPipeline = device.createRenderPipeline({
    label: 'body-pick-point-pipeline',
    layout: device.createPipelineLayout({
      label: 'body-pick-point-pipeline-layout',
      bindGroupLayouts: [pointBgl],
    }),
    vertex: {
      module: pointModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: POINT_INSTANCE_STRIDE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' }, // posRelCamMpc
            { shaderLocation: 1, offset: 12, format: 'uint32' }, // packedId
          ],
        },
      ],
    },
    fragment: {
      module: pointModule,
      entryPoint: 'fsPick',
      targets: [{ format: 'r32uint' }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // Grow-only per-frame instance buffer for the point pick (rebuilt per pass,
  // like starPointRenderer's — the camera-relative anchors change per frame).
  let pointInstanceBuffer: GPUBuffer | null = null;
  let pointCapacity = 0;

  // ── Per-pass cursor + reset ───────────────────────────────────────────────
  //
  // The sphere cursor advances per draw within a pass and resets when a NEW pass
  // object is first seen. Comparing pass identity is the per-pass boundary: the
  // pick program calls `beginRenderPass` once per `pick()` / `renderForDebug()`,
  // so each fresh encoder object marks a fresh submit whose writeBuffer slots may
  // be reused from scratch.
  let currentPass: GPURenderPassEncoder | null = null;
  let sphereCursor = 0;

  function beginPassIfNew(pass: GPURenderPassEncoder): void {
    if (pass !== currentPass) {
      currentPass = pass;
      sphereCursor = 0;
    }
  }

  function drawSphere(pass: GPURenderPassEncoder, args: BodySpherePickArgs): void {
    beginPassIfNew(pass);
    // Guard the fixed slot count. Never reached given the seed roster (~50 < 64);
    // dropping a tail draw beats a dynamic-offset-out-of-range validation error.
    if (sphereCursor >= MAX_SPHERE_DRAWS) return;

    sphereScratchF32.set(args.mvp, 0);
    sphereScratchU32[SPHERE_PACKED_ID_U32_INDEX] = args.packedId >>> 0;

    const dynamicOffset = sphereCursor * slotStride;
    device.queue.writeBuffer(sphereUniformBuffer, dynamicOffset, sphereScratch);

    pass.setPipeline(spherePipeline);
    pass.setBindGroup(0, sphereBindGroup, [dynamicOffset]);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount);

    sphereCursor += 1;
  }

  function drawPoints(pass: GPURenderPassEncoder, args: BodyPointPickArgs): void {
    beginPassIfNew(pass);
    const { vp, viewportPx, points } = args;
    const n = points.length;
    if (n === 0) return;

    // Own per-frame uniform (camera prefix only). One draw per pass, so this
    // single buffer is written once — no in-pass race.
    writeCameraPrefix(pointUniformScratch, vp, viewportPx);
    device.queue.writeBuffer(pointUniformBuffer, 0, pointUniformScratch);

    // Pack posRelCamMpc (f32×3) + packedId (u32) interleaved. One ArrayBuffer
    // viewed as both, so the mixed types share the 16-byte stride.
    const interleaved = new ArrayBuffer(n * POINT_INSTANCE_STRIDE);
    const f32 = new Float32Array(interleaved);
    const u32 = new Uint32Array(interleaved);
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      const base = i * POINT_INSTANCE_WORDS;
      f32[base + 0] = p.posRelCamMpc[0];
      f32[base + 1] = p.posRelCamMpc[1];
      f32[base + 2] = p.posRelCamMpc[2];
      u32[base + 3] = p.packedId >>> 0;
    }

    // Grow-only reuse: reallocate only when the batch outgrows the buffer (the
    // ~25-star seed never grows post-boot, so this is one bounded allocation).
    if (pointInstanceBuffer === null || n > pointCapacity) {
      pointInstanceBuffer?.destroy();
      pointCapacity = n;
      pointInstanceBuffer = device.createBuffer({
        label: 'body-pick-point-instance-vbo',
        size: pointCapacity * POINT_INSTANCE_STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(pointInstanceBuffer, 0, interleaved);

    pass.setPipeline(pointPipeline);
    pass.setBindGroup(0, pointBindGroup);
    pass.setVertexBuffer(0, pointInstanceBuffer);
    // Six vertices per instanced billboard quad (lib/billboard's quadCorner).
    pass.draw(6, n);
  }

  function destroy(): void {
    positionBuffer.destroy();
    indexBuffer.destroy();
    sphereUniformBuffer.destroy();
    pointUniformBuffer.destroy();
    pointInstanceBuffer?.destroy();
    pointInstanceBuffer = null;
  }

  const renderer: BodyPickRenderer = {
    label: 'bodyPickRenderer',
    drawSphere,
    drawPoints,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
