/**
 * bodyPickRenderer — the r32uint pick provider for the NEAR0 foreground bodies
 * (Earth, the planets, and the ~25 seeded scene stars incl. the Sun).
 *
 * It records pickable body geometry into an ALREADY-BEGUN r32uint pick pass
 * (owned by the pick program), stamping each body's caller-packed identity into
 * the texels it covers. Like `starCatalogPickRenderer`, it owns no pass, no
 * texture and no readback.
 *
 * ### Two geometries → two OWN pipelines
 *
 *   - `drawSphere` — ONE body sphere per call (Earth, a planet, a resolved
 *     scene-star sphere). The unit-sphere mesh is uploaded as PROXY geometry
 *     only: `spherePick.wesl` inflates it, ray-traces the analytic sphere per
 *     fragment and discards the misses, so the clickable disc is the body's exact
 *     disc rather than a 48-gon — hence `cullMode: 'front'` and the shader's
 *     `@builtin(frag_depth)` on this pipeline.
 *   - `drawPoints` — a sub-pixel body POINT partition as one instanced draw of
 *     pick billboards, each expanded to a generous 18 px footprint (these are the
 *     ≤25 labelled scene stars and the sub-pixel solar-system body glints — sparse
 *     click-invited targets; the survey star pick keeps its minimal clamp for its
 *     dense field — see `starPointPick.wesl`). Safe to call MULTIPLE times per
 *     SUBMIT — see the writeBuffer-vs-submit section below. The caller's
 *     `variant` selects the pick-depth semantics: `'sceneStar'` (default, the
 *     famous stars — `vs` min-clamps true depth) vs `'glint'` (the body glints +
 *     Earth stamp — `vsGlint` forces the shallow glint band so importance, not
 *     nearness, orders them).
 *
 * The sphere and points paths each compile their OWN `GPUShaderModule` (never a
 * shared module across the sphere/points pipelines — the WebGPU 'auto'-layout
 * trap). WITHIN the points path the two variant pipelines (`vs`/`vsGlint`) share
 * ONE `GPUShaderModule` AND one EXPLICIT pipeline layout, so a per-submit slot's
 * bind group binds to either.
 *
 * ### The writeBuffer-vs-submit trap — the one race this file guards, twice
 *
 * A pick SUBMIT now records MULTIPLE render passes: one per body-m slab row
 * (Earth, each flat planet) plus one NEAR0 pass for the star spheres/points.
 * Every `queue.writeBuffer` made anywhere in that submit lands BEFORE the GPU
 * runs any of its recorded commands, so a draw path that reused ONE shared
 * buffer across calls would have every recorded draw read the LAST call's bytes
 * — the exact "planets have no picking representation" bug.
 *
 * Both paths avoid it with a per-SUBMIT cursor (`sphereCursor` / `pointCursor`)
 * that gives each call its own slot of bytes, never shared with another call:
 * `drawSphere` writes a 256-byte-aligned DYNAMIC-OFFSET slot in one shared
 * uniform buffer (the pick contract is one sphere per call, so there is no
 * batch to instance the way the visual `planetRenderer` does); `drawPoints`
 * claims a whole `{ uniformBuffer, bindGroup, instanceBuffer }` slot per
 * CALLER, grown on demand — a per-body dynamic offset can't express its
 * variable-length instance buffer, so it gets its own buffer set instead
 * (`texturedBodyRenderer`'s own-buffer-per-body fix, keyed here by call order
 * rather than a body id).
 *
 * Either way, the cursor resets to 0 ONLY when the submit owner calls
 * `beginSubmit()` — never on pass identity. A pass-identity reset is the bug
 * this renderer once had: `pick()` / `renderForDebug()` (`pickProgram.ts`) each
 * begin several passes per submit, so resetting per pass re-zeroed the cursor
 * mid-submit and let a later pass's draw reuse an earlier pass's slot. Slots
 * ARE safely reused across submits — the prior submit already ran on the queue
 * before its slots are handed out again.
 *
 * ### Depth-tested, r32uint, no blend
 *
 * Both pipelines carry the NEAR0 `depth32float` depth profile
 * (`depthCompare: 'greater'`, `depthWriteEnabled: true`, the NEAR0 slab's reversed-Z
 * convention — clear `0.0`, greater-z-wins) so overlapping bodies — a
 * Moon in front of Earth — resolve nearest-wins, matching visual occlusion. That
 * test is only as good as the depth fed into it, which is why the sphere fragment
 * writes the analytic hit's depth rather than the proxy's. The
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
import {
  BODY_SPHERE_RINGS,
  BODY_SPHERE_SEGMENTS,
} from '../../../../data/bodies/sphereTessellation';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import spherePickCode from '../../shaders/bodies/spherePick.wesl?static';
import starPointPickCode from '../../shaders/bodies/starPointPick.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { writeCameraPrefix } from '../../lib/cameraUniforms';

/**
 * `SpherePickUniforms` byte size (spherePick.wesl): mat4x4<f32> (64) +
 * vec3<f32> (12) + u32 (4) = 80. The CPU scratch mirrors it:
 * f32[0..15] = mvp, f32[16..18] = camPosLocal, u32[19] = packedId.
 *
 * `packedId` occupies the 4 bytes a `vec3<f32>` leaves behind (12 bytes of data,
 * 16 bytes of alignment), so the struct carries the camera position for free —
 * the `RingUniforms.planetRadiusRatio` pad-slot trick. Declaring `camPosLocal`
 * after `packedId` instead would have opened a fresh 16-byte row and grown the
 * struct to 96, changing `minBindingSize` and the slot budget below with it.
 */
const SPHERE_UNIFORM_BYTES = 80;
/** f32 index of `camPosLocal`'s first component in the sphere scratch (byte 64 / 4). */
const SPHERE_CAM_POS_LOCAL_F32_INDEX = 16;
/** u32 index of `packedId` in the 80-byte sphere scratch (byte 76 / 4). */
const SPHERE_PACKED_ID_U32_INDEX = 19;

/**
 * Upper bound on sphere pick draws recorded across one SUBMIT: every body-m
 * row (Earth + `SCENE_PLANETS`, 21 today) plus whichever `SCENE_STARS` spheres
 * are RESOLVED this frame — not the full 119-star roster, most of which stays
 * point billboards via `drawPoints`. Data-dependent, not a fixed sum, but the
 * seed roster leaves comfortable headroom. An over-count draws the first
 * `MAX_SPHERE_DRAWS` and drops the tail (dropped-tail beats a GPU validation
 * error) — raise this constant if a future roster ever approaches it.
 */
const MAX_SPHERE_DRAWS = 64;

/** `CameraUniforms` byte size (lib/camera.wesl): viewProj (64) + viewportPx (8)
 *  + 2 pad floats (8) = 80. The scene-star point pick binds this per frame. */
const POINT_UNIFORM_BYTES = 80;

/**
 * Per-instance byte stride for the SCENE-STAR point pick (`vs`): posRelCamMpc
 * (float32x3, 12) + packedId (u32, 4) = 16. Byte-exact with the `@location`
 * offsets in starPointPick.wesl.
 */
const POINT_INSTANCE_STRIDE = 16;
/** Word count per scene-star instance (3 f32 + 1 u32). */
const POINT_INSTANCE_WORDS = 4;

/**
 * Per-instance byte stride for the GLINT point pick (`vsGlint`): the scene-star
 * 16 plus a `bandClass` u32 (offset 16) = 20. The glint pipeline supplies this
 * wider vertex layout; the two pipelines share only the BIND-GROUP layout, so
 * their instance strides may differ. Byte-exact with `vsGlint`'s `@location(2)`.
 */
const POINT_INSTANCE_STRIDE_GLINT = 20;
/** Word count per glint instance (3 f32 + 2 u32). */
const POINT_INSTANCE_WORDS_GLINT = 5;
/** u32 word index of `bandClass` in a glint instance (byte 16 / 4). */
const GLINT_BAND_CLASS_WORD = 4;

/**
 * @param reversedZ selects the NEAR0 slab's depth convention (single-sourced in
 *   `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
 *   `true` ⇒ reversed-Z greater-wins. The one flag covers BOTH pick pipelines
 *   (sphere + points), resolved through `resolveDepthCompare`.
 */
export function createBodyPickRenderer(device: GPUDevice, reversedZ: boolean): BodyPickRenderer {
  // ── Shared sphere geometry (positions + indices; no uvs — the pick fragment
  //    samples nothing) ────────────────────────────────────────────────────
  const mesh = uvSphereMesh(BODY_SPHERE_SEGMENTS, BODY_SPHERE_RINGS);
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
  // One 80-byte ArrayBuffer viewed as both f32 (mvp + camPosLocal) and u32
  // (packedId), rewritten per draw and uploaded into the cursor's slot.
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
      // `front`, not `back`: the mesh is a 5%-inflated PROXY the shader ray-traces
      // through, so the FAR hemisphere is the one that must rasterise. Culling
      // back faces instead would drop the body's pick entirely the moment the
      // camera crossed inside the proxy shell — a legal close approach, 5% of a
      // body radius above the surface. See `spherePick.wesl`.
      cullMode: 'front',
    },
    // NEAR0 depth profile — see module header (Moon-in-front-of-Earth resolves).
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  // ── Scene-star / body-glint point pick pipeline (instanced billboards) ─────
  // 20-float scratch: writeCameraPrefix fills [0..17]; [18..19] stay 0 pads.
  // Shared across per-submit slots — writeBuffer copies it immediately, so
  // reusing the CPU scratch between slot uploads is safe.
  const pointUniformScratch = new Float32Array(POINT_UNIFORM_BYTES / 4);

  const pointBgl = device.createBindGroupLayout({
    label: 'body-pick-point-bgl',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });

  const pointModule = createShaderModuleWithDevLog(
    device,
    starPointPickCode,
    'bodyPick.starPointPick',
  );

  // Both point pipelines share ONE explicit layout, so their bind groups are
  // interchangeable — the per-submit slot's bind group binds correctly to either.
  // (The 'auto'-layout trap does NOT arise here: it only bites pipelines whose
  // layout was inferred; an EXPLICIT shared layout is exactly the fix for it.)
  const pointPipelineLayout = device.createPipelineLayout({
    label: 'body-pick-point-pipeline-layout',
    bindGroupLayouts: [pointBgl],
  });

  // One pipeline per vertex entry of starPointPick.wesl: 'vs' clamps true depth
  // onto the scene-star band (the famous stars, whose within-far members sort
  // physically); 'vsGlint' FORCES a per-instance CLASS band so sub-pixel planets/
  // moons rank by importance (earth > planet > moon, unconditional — see the
  // shader header). The two differ in the vertex entry AND the instance layout —
  // 'vsGlint' reads a third `bandClass` attribute, widening the stride 16 → 20 —
  // so the buffer layout is a parameter; the fragment, r32uint target, and NEAR0
  // depth profile are identical.
  function makePointPipeline(
    entryPoint: 'vs' | 'vsGlint',
    label: string,
    buffers: GPUVertexBufferLayout[],
  ): GPURenderPipeline {
    return device.createRenderPipeline({
      label,
      layout: pointPipelineLayout,
      vertex: { module: pointModule, entryPoint, buffers },
      fragment: {
        module: pointModule,
        entryPoint: 'fsPick',
        targets: [{ format: 'r32uint' }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        format: 'depth32float',
        depthWriteEnabled: true,
        depthCompare: resolveDepthCompare('nearer', reversedZ),
      },
    });
  }
  const pointPipeline = makePointPipeline('vs', 'body-pick-point-pipeline', [
    {
      arrayStride: POINT_INSTANCE_STRIDE,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' }, // posRelCamMpc
        { shaderLocation: 1, offset: 12, format: 'uint32' }, // packedId
      ],
    },
  ]);
  const pointGlintPipeline = makePointPipeline('vsGlint', 'body-pick-point-glint-pipeline', [
    {
      arrayStride: POINT_INSTANCE_STRIDE_GLINT,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' }, // posRelCamMpc
        { shaderLocation: 1, offset: 12, format: 'uint32' }, // packedId
        { shaderLocation: 2, offset: 16, format: 'uint32' }, // bandClass (glint only)
      ],
    },
  ]);

  // ── Per-submit point-pick slots (own buffers per caller — module header) ──
  //
  // Each `drawPoints` call claims the NEXT slot: its own uniform buffer + bind
  // group + grow-only instance buffer, created on first use and reused across
  // submits.
  type PointSlot = {
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
    instanceBuffer: GPUBuffer | null;
    // Allocated instance-buffer size in BYTES, NOT instance count. A slot is keyed
    // by CALL ORDER (pointCursor), not by caller, so the SAME slot can be claimed
    // by a different-STRIDE variant across submits (a 16-byte scene-star batch one
    // submit, a 20-byte glint batch the next). Tracking bytes — not count — lets the
    // grow check catch a stride widening that a count-only check would miss.
    byteCapacity: number;
  };
  const pointSlots: PointSlot[] = [];

  function pointSlotAt(index: number): PointSlot {
    const existing = pointSlots[index];
    if (existing) return existing;
    const uniformBuffer = device.createBuffer({
      label: `body-pick-point-uniform-${index}`,
      size: POINT_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const slot: PointSlot = {
      uniformBuffer,
      bindGroup: device.createBindGroup({
        label: `body-pick-point-bg-${index}`,
        layout: pointBgl,
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      }),
      instanceBuffer: null,
      byteCapacity: 0,
    };
    pointSlots[index] = slot;
    return slot;
  }

  // ── Per-submit cursors + reset — see the module header ────────────────────
  let sphereCursor = 0;
  let pointCursor = 0;

  function beginSubmit(): void {
    sphereCursor = 0;
    pointCursor = 0;
  }

  function drawSphere(pass: GPURenderPassEncoder, args: BodySpherePickArgs): void {
    // Guard the fixed slot count (MAX_SPHERE_DRAWS above); dropping a tail draw
    // beats a dynamic-offset-out-of-range validation error.
    if (sphereCursor >= MAX_SPHERE_DRAWS) return;

    sphereScratchF32.set(args.mvp, 0);
    // `set` (not three indexed writes) because `camPosLocal` is a Vec3 tuple and
    // its three components are contiguous at f32 16..18 — the vec3's own slot.
    sphereScratchF32.set(args.camPosLocal, SPHERE_CAM_POS_LOCAL_F32_INDEX);
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
    const { vp, viewportPx, points } = args;
    const n = points.length;
    if (n === 0) return;

    // Claim THIS call's own slot, advancing the per-submit cursor (module
    // header) so a second same-submit caller writes a DIFFERENT buffer pair.
    const slot = pointSlotAt(pointCursor);
    pointCursor += 1;

    // Own per-frame uniform (camera prefix only), written into this slot's buffer.
    writeCameraPrefix(pointUniformScratch, vp, viewportPx);
    device.queue.writeBuffer(slot.uniformBuffer, 0, pointUniformScratch);

    // The glint variant carries a third `bandClass` u32 per instance (stride 20);
    // the scene-star variant does not (stride 16). Narrowing on `variant` here
    // pins `glintPoints` to the `BodyGlintPick[]` arm of the discriminated union
    // (`BodyPointPickArgs`), so each point's `bandClass` below is a REQUIRED number
    // — no runtime default, no cast. The chosen stride must match the pipeline's
    // vertex layout selected below.
    const glintPoints = args.variant === 'glint' ? args.points : null;
    const isGlint = glintPoints !== null;
    const stride = isGlint ? POINT_INSTANCE_STRIDE_GLINT : POINT_INSTANCE_STRIDE;
    const words = isGlint ? POINT_INSTANCE_WORDS_GLINT : POINT_INSTANCE_WORDS;

    // Pack posRelCamMpc (f32×3) + packedId (u32) [+ bandClass (u32) for glints]
    // interleaved. One ArrayBuffer viewed as both, so the mixed types share the
    // stride.
    const interleaved = new ArrayBuffer(n * stride);
    const f32 = new Float32Array(interleaved);
    const u32 = new Uint32Array(interleaved);
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      const base = i * words;
      f32[base + 0] = p.posRelCamMpc[0];
      f32[base + 1] = p.posRelCamMpc[1];
      f32[base + 2] = p.posRelCamMpc[2];
      u32[base + 3] = p.packedId >>> 0;
      if (glintPoints !== null) {
        // `bandClass` is type-required on `BodyGlintPick` (the glint arm of the
        // discriminated union), so it is always present here — no `?? …` default.
        // That the type FORBIDS omitting it is load-bearing: class 0 is the
        // strongest (the Earth band), so a forgotten class defaulting to it would
        // tie Earth at forced-equal depth and reintroduce the ulp-jitter roulette
        // the class bands exist to eliminate. Illegal state, made unrepresentable.
        u32[base + GLINT_BAND_CLASS_WORD] = glintPoints[i]!.bandClass >>> 0;
      }
    }

    // Grow-only, BYTE-aware reuse per slot: reallocate whenever the batch's
    // required BYTES outgrow this slot's allocation. Sizing the check by bytes (not
    // instance count) is load-bearing: a slot is claimed by call ORDER, so the same
    // slot can be inherited by a WIDER-stride variant across submits — e.g. when
    // starPointsLayer drops out of a submit (famous-stars toggle off, or the roster
    // resolves to spheres) and bodyGlintsLayer becomes the first point caller,
    // inheriting slot 0 that was last sized for 16-byte scene-star instances. A
    // count-only check (`n > capacity`) would keep the 16-byte buffer for 20-byte
    // glints whenever `n` still fits, and `writeBuffer` would then run PAST the
    // buffer end — a validation error that silently drops the pick pass. Comparing
    // bytes makes the stride change trigger a realloc; grow-only otherwise (the
    // ~25-body seeds never grow post-boot, so this is one bounded allocation).
    const requiredBytes = n * stride;
    if (slot.instanceBuffer === null || requiredBytes > slot.byteCapacity) {
      slot.instanceBuffer?.destroy();
      slot.byteCapacity = requiredBytes;
      slot.instanceBuffer = device.createBuffer({
        label: `body-pick-point-instance-vbo-${pointCursor - 1}`,
        size: slot.byteCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(slot.instanceBuffer, 0, interleaved);

    // Pick the depth-semantics variant. The bind group is layout-shared, so it
    // binds to either pipeline unchanged (see the pipeline-layout note above).
    pass.setPipeline(isGlint ? pointGlintPipeline : pointPipeline);
    pass.setBindGroup(0, slot.bindGroup);
    pass.setVertexBuffer(0, slot.instanceBuffer);
    // Six vertices per instanced billboard quad (lib/billboard's quadCorner).
    pass.draw(6, n);
  }

  function destroy(): void {
    positionBuffer.destroy();
    indexBuffer.destroy();
    sphereUniformBuffer.destroy();
    for (const slot of pointSlots) {
      slot.uniformBuffer.destroy();
      slot.instanceBuffer?.destroy();
    }
    pointSlots.length = 0;
  }

  const renderer: BodyPickRenderer = {
    label: 'bodyPickRenderer',
    beginSubmit,
    drawSphere,
    drawPoints,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
