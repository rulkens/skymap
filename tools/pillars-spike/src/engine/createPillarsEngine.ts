/**
 * createPillarsEngine — the one GPU-orchestration module of the spike.
 * Owns the WebGPU device, every texture/pipeline/buffer, the orbit camera
 * + input, and the frame loop. Structure mirrors the galaxy-renderer's
 * createGalaxyEngine (the sibling tool this spike is modelled on).
 *
 * ## The pass chain
 *
 *   boot / '↻ new cloud' ──► generateField compute ──► field 3D texture
 *                            bakeLight compute ×8 z-slabs ──► light 3D texture
 *                            (one queue: bake reads the field only after
 *                             generation's submit — queue order, no readback)
 *
 *   every frame:
 *   ┌─ scene pass (HDR, sub-res by renderScale) ────────────────────────┐
 *   │  background  fullscreen bgColor(dir)          (no blend)          │
 *   │  nebula      volumetric raymarch, composites                      │
 *   │              its own background behind T·bg   (no blend)          │
 *   │  stars       HDR billboards, vertex-occluded  (additive)          │
 *   └────────────────────────────────────────────────────────────────────┘
 *   bright pass ──► bloom mip 0 (half-res, soft threshold, firefly cap)
 *   downsample 1..5 ──► ever-coarser mips (Karis average on level 0)
 *   upsample 4..0 (additive) ──► fold coarse mips back onto finer ones
 *   composite ──► canvas: scene + bloom, exposure → tonemap → grade →
 *                 grain-dither → gamma (also performs the upscale from
 *                 the sub-res HDR target — the renderScale perf lever)
 *
 * No depth buffer anywhere: the volume integrates its own visibility, the
 * background is drawn first, and stars handle occlusion in the vertex
 * stage (see stars.wesl) — a Z buffer would be useless against a
 * participating medium anyway.
 *
 * ## Why BOTH bakes are split into z-slab submits, awaited one by one
 *
 * The bakes touch ~5.7M voxels — the light bake at ~150 texture taps
 * each. As ONE dispatch in one command buffer that flirts with GPU-
 * watchdog timeouts: verified empirically, a software WebGPU
 * implementation (SwiftShader in headless Chromium) LOSES THE DEVICE
 * ~1.5 s into a full-grid generation dispatch, and macOS/Windows kill
 * multi-second command buffers on real hardware too. Small z-slab
 * submits with an awaited queue.onSubmittedWorkDone() between them keep
 * every command buffer far below any watchdog and let the browser
 * breathe during the bake. Each slab gets its OWN pre-written uniform
 * buffer, so no writeBuffer lands between already-recorded submits (the
 * repo's standing writeBuffer-vs-submit ordering trap — see CLAUDE.md
 * 'Things that have bitten us').
 */
import { mat4 } from 'wgpu-matrix';

import type { PillarsEngineHandle } from '../../@types/PillarsEngineHandle';
import type { PillarsSettings } from '../../@types/PillarsSettings';

import { LIGHT_STARS } from '../data/lightStars';
import { buildStarInstances } from './buildStarInstances';
import { packLightStarsUniform } from './packLightStarsUniform';
import { packSceneUniforms } from './packSceneUniforms';

import generateFieldWgsl from '../shaders/generateField.wesl?static';
import generateDetailWgsl from '../shaders/generateDetail.wesl?static';
import bakeOccupancyWgsl from '../shaders/bakeOccupancy.wesl?static';
import bakeSkipWgsl from '../shaders/bakeSkip.wesl?static';
import bakeLightWgsl from '../shaders/bakeLight.wesl?static';
import backgroundWgsl from '../shaders/background.wesl?static';
import nebulaWgsl from '../shaders/nebula.wesl?static';
import starsWgsl from '../shaders/stars.wesl?static';
import brightWgsl from '../shaders/bloomBright.wesl?static';
import downsampleWgsl from '../shaders/bloomDownsample.wesl?static';
import upsampleWgsl from '../shaders/bloomUpsample.wesl?static';
import compositeWgsl from '../shaders/composite.wesl?static';

/** HDR working format for scene + bloom pyramid. */
const HDR: GPUTextureFormat = 'rgba16float';

/**
 * Default voxel grid (w, h, d). Taller than wide because the subject is
 * vertical columns. rgba8 × 160·224·160 ≈ 23 MB per volume (field + light
 * ≈ 46 MB) — comfortably under any discrete/integrated budget while
 * giving ~70 voxels across the main pillar's width. Overridable via
 * opts.volumeDims (the ?vol=tiny escape hatch for software WebGPU).
 */
const DEFAULT_VOLUME_DIMS: readonly [number, number, number] = [160, 224, 160];
/** Compute workgroup edge (must match @workgroup_size in both bakes). */
const WG = 4;
/** Bake z-slab thickness in voxels — see module header. */
const SLAB_DEPTH = 8;
/** Bloom pyramid depth. One more level than the galaxy-renderer: the
 * nebula wants very wide, soft halos around the hero stars. */
const BLOOM_MIPS = 6;
/** Fainter cluster members around the 3 light stars. */
const CLUSTER_STARS = 24;
const PILLAR_STARS = 40;

/** Tiling detail-noise texture edge (see generateDetail.wesl). */
const DETAIL_DIM = 64;
/** Fine→coarse divisor for the empty-space-skip grid (bakeOccupancy /
 * bakeSkip). 4 keeps each coarse brick ~4 fine voxels, small enough that
 * the 4^3 brick subsample never misses a thin column. */
const COARSE_FACTOR = 4;

const DEFAULT_SETTINGS: PillarsSettings = {
  densityMul: 1.0,
  emissionMul: 6.0,
  scatterMul: 2.5,
  ambientMul: 0.8,
  detailErosion: 0.55,
  detailScale: 5.0,
  starBrightness: 1.0,
  phaseG: 0.45,
  exposure: 1.05,
  bloom: 0.55,
  saturation: 1.12,
  vignette: 0.32,
  tonemap: 0,
  renderScale: 0.75,
};

export async function createPillarsEngine(
  canvas: HTMLCanvasElement,
  opts: {
    onFps?: (fps: number) => void;
    volumeDims?: readonly [number, number, number];
  } = {},
): Promise<PillarsEngineHandle> {
  const VOLUME_DIMS = opts.volumeDims ?? DEFAULT_VOLUME_DIMS;
  if (!navigator.gpu) throw new Error('no-webgpu');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no-adapter');
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu') as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const settings: PillarsSettings = { ...DEFAULT_SETTINGS };

  // ---- volumes -------------------------------------------------------
  const volumeUsage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING;
  const fieldTex = device.createTexture({
    label: 'pillars:field',
    size: VOLUME_DIMS as [number, number, number],
    dimension: '3d',
    format: 'rgba8unorm',
    usage: volumeUsage,
  });
  const lightTex = device.createTexture({
    label: 'pillars:light',
    size: VOLUME_DIMS as [number, number, number],
    dimension: '3d',
    format: 'rgba8unorm',
    usage: volumeUsage,
  });
  const volSampler = device.createSampler({
    label: 'pillars:volSampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });
  // Tiling detail-erosion noise (generateDetail.wesl): tiny, baked once,
  // sampled with REPEAT addressing so world coordinates run unbounded.
  const detailTex = device.createTexture({
    label: 'pillars:detail',
    size: [DETAIL_DIM, DETAIL_DIM, DETAIL_DIM],
    dimension: '3d',
    format: 'rgba8unorm',
    usage: volumeUsage,
  });
  const detailSampler = device.createSampler({
    label: 'pillars:detailSampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    addressModeW: 'repeat',
  });
  // Coarse empty-space-skip grid: occupancy (max dust+gas per brick) feeds
  // the conservative distance field the marcher leaps by. Both sampled/read
  // with clamp addressing (the shared volSampler suffices for skipField).
  const COARSE_DIMS: [number, number, number] = [
    Math.ceil(VOLUME_DIMS[0] / COARSE_FACTOR),
    Math.ceil(VOLUME_DIMS[1] / COARSE_FACTOR),
    Math.ceil(VOLUME_DIMS[2] / COARSE_FACTOR),
  ];
  const occTex = device.createTexture({
    label: 'pillars:occupancy',
    size: COARSE_DIMS,
    dimension: '3d',
    format: 'rgba8unorm',
    usage: volumeUsage,
  });
  const skipTex = device.createTexture({
    label: 'pillars:skip',
    size: COARSE_DIMS,
    dimension: '3d',
    format: 'rgba8unorm',
    usage: volumeUsage,
  });

  // ---- uniform buffers -----------------------------------------------
  const sceneBuf = device.createBuffer({
    label: 'pillars:scene',
    size: 160,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const starsBuf = device.createBuffer({
    label: 'pillars:lightStars',
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(starsBuf, 0, packLightStarsUniform(LIGHT_STARS));
  // One uniform buffer PER z-slab for EACH bake — no uniform is ever
  // rewritten between recorded submits (see module header). The gen
  // buffers carry (seed, zBase) and are rewritten as a batch at the start
  // of each regenerate, before any of that batch's submits are recorded;
  // the bake buffers are static (zBase only) and written once here.
  const slabCount = Math.ceil(VOLUME_DIMS[2] / SLAB_DEPTH);
  const genSlabBufs = Array.from({ length: slabCount }, (_, i) =>
    device.createBuffer({
      label: `pillars:genSlab${i}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );
  const bakeSlabBufs = Array.from({ length: slabCount }, (_, i) => {
    const b = device.createBuffer({
      label: `pillars:bakeSlab${i}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(b, 0, new Uint32Array([i * SLAB_DEPTH, 0, 0, 0]));
    return b;
  });
  // Coarse-grid z-slab uniforms (zBase only) — shared by the occupancy and
  // skip passes, which run sequentially and never rewrite them, so one set
  // is race-free (same policy as bakeSlabBufs).
  const coarseSlabCount = Math.ceil(COARSE_DIMS[2] / SLAB_DEPTH);
  const coarseSlabBufs = Array.from({ length: coarseSlabCount }, (_, i) => {
    const b = device.createBuffer({
      label: `pillars:coarseSlab${i}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(b, 0, new Uint32Array([i * SLAB_DEPTH, 0, 0, 0]));
    return b;
  });
  const brightBuf = device.createBuffer({
    label: 'pillars:bright',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // x: soft threshold — above the tone-mapped mid-tones so broad dust
  // doesn't bloom; y: firefly cap, generous because hero stars SHOULD
  // seed big halos (Karis averaging handles the flicker).
  device.queue.writeBuffer(brightBuf, 0, new Float32Array([1.0, 8.0, 0, 0]));
  const compBuf = device.createBuffer({
    label: 'pillars:composite',
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const mipTexelBufs = Array.from({ length: BLOOM_MIPS }, (_, i) =>
    device.createBuffer({
      label: `pillars:mipTexel${i}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );

  // ---- star instance buffer ------------------------------------------
  const starData = buildStarInstances(LIGHT_STARS, CLUSTER_STARS, PILLAR_STARS, 1337);
  const starCount = starData.length / 8;
  const starVB = device.createBuffer({
    label: 'pillars:starVB',
    size: starData.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(starVB.getMappedRange()).set(starData);
  starVB.unmap();

  // ---- shader modules + pipelines --------------------------------------
  // Dev-log compile errors like the runtime does — a silently-invalid
  // pipeline otherwise drops whole frames with no console output.
  const makeShader = (code: string, label: string): GPUShaderModule => {
    const mod = device.createShaderModule({ label, code });
    if (import.meta.env.DEV) {
      void mod.getCompilationInfo().then((info) => {
        for (const m of info.messages) {
          if (m.type === 'error') {
            console.error(`[${label}] ${m.lineNum}:${m.linePos} ${m.message}`);
          }
        }
      });
    }
    return mod;
  };

  const genPipe = device.createComputePipeline({
    label: 'pillars:genPipe',
    layout: 'auto',
    compute: { module: makeShader(generateFieldWgsl, 'pillars:generateField'), entryPoint: 'main' },
  });
  const bakePipe = device.createComputePipeline({
    label: 'pillars:bakePipe',
    layout: 'auto',
    compute: { module: makeShader(bakeLightWgsl, 'pillars:bakeLight'), entryPoint: 'main' },
  });
  const detailPipe = device.createComputePipeline({
    label: 'pillars:detailPipe',
    layout: 'auto',
    compute: {
      module: makeShader(generateDetailWgsl, 'pillars:generateDetail'),
      entryPoint: 'main',
    },
  });
  const occPipe = device.createComputePipeline({
    label: 'pillars:occPipe',
    layout: 'auto',
    compute: { module: makeShader(bakeOccupancyWgsl, 'pillars:bakeOccupancy'), entryPoint: 'main' },
  });
  const skipPipe = device.createComputePipeline({
    label: 'pillars:skipPipe',
    layout: 'auto',
    compute: { module: makeShader(bakeSkipWgsl, 'pillars:bakeSkip'), entryPoint: 'main' },
  });

  const bgMod = makeShader(backgroundWgsl, 'pillars:background');
  const bgPipe = device.createRenderPipeline({
    label: 'pillars:bgPipe',
    layout: 'auto',
    vertex: { module: bgMod, entryPoint: 'vs' },
    fragment: { module: bgMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list' },
  });

  const nebulaMod = makeShader(nebulaWgsl, 'pillars:nebula');
  const nebulaPipe = device.createRenderPipeline({
    label: 'pillars:nebulaPipe',
    layout: 'auto',
    vertex: { module: nebulaMod, entryPoint: 'vs' },
    fragment: { module: nebulaMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    // Front-face culling: only BACK faces rasterise, which covers both
    // camera-outside and camera-inside the volume (see nebula.wesl).
    primitive: { topology: 'triangle-list', cullMode: 'front' },
  });

  const starMod = makeShader(starsWgsl, 'pillars:stars');
  const starPipe = device.createRenderPipeline({
    label: 'pillars:starPipe',
    layout: 'auto',
    vertex: {
      module: starMod,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 32,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32' },
            { shaderLocation: 2, offset: 16, format: 'float32x3' },
            { shaderLocation: 3, offset: 28, format: 'float32' },
          ],
        },
      ],
    },
    fragment: {
      module: starMod,
      entryPoint: 'fs',
      targets: [
        {
          format: HDR,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  const mkPost = (code: string, label: string, targetFmt: GPUTextureFormat): GPURenderPipeline => {
    const mod = makeShader(code, label);
    return device.createRenderPipeline({
      label,
      layout: 'auto',
      vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: targetFmt }] },
      primitive: { topology: 'triangle-list' },
    });
  };
  const brightPipe = mkPost(brightWgsl, 'pillars:brightPipe', HDR);
  const downPipe = mkPost(downsampleWgsl, 'pillars:downPipe', HDR);
  const upMod = makeShader(upsampleWgsl, 'pillars:upsample');
  const upPipe = device.createRenderPipeline({
    label: 'pillars:upPipe',
    layout: 'auto',
    vertex: { module: upMod, entryPoint: 'vs' },
    fragment: {
      module: upMod,
      entryPoint: 'fs',
      targets: [
        {
          format: HDR,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });
  const compPipe = mkPost(compositeWgsl, 'pillars:compPipe', format);

  // ---- static bind groups ----------------------------------------------
  const linearSampler = device.createSampler({
    label: 'pillars:linearSampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const detailBG = device.createBindGroup({
    label: 'pillars:detailBG',
    layout: detailPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: detailTex.createView() }],
  });
  const occBGs = coarseSlabBufs.map((buf, i) =>
    device.createBindGroup({
      label: `pillars:occBG${i}`,
      layout: occPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buf } },
        { binding: 1, resource: fieldTex.createView() },
        { binding: 2, resource: volSampler },
        { binding: 3, resource: occTex.createView() },
      ],
    }),
  );
  const skipBGs = coarseSlabBufs.map((buf, i) =>
    device.createBindGroup({
      label: `pillars:skipBG${i}`,
      layout: skipPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buf } },
        { binding: 1, resource: occTex.createView() },
        { binding: 2, resource: skipTex.createView() },
      ],
    }),
  );
  const genBGs = genSlabBufs.map((buf, i) =>
    device.createBindGroup({
      label: `pillars:genBG${i}`,
      layout: genPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buf } },
        { binding: 1, resource: fieldTex.createView() },
      ],
    }),
  );
  const bakeBGs = bakeSlabBufs.map((slabBuf, i) =>
    device.createBindGroup({
      label: `pillars:bakeBG${i}`,
      layout: bakePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: slabBuf } },
        { binding: 1, resource: { buffer: starsBuf } },
        { binding: 2, resource: fieldTex.createView() },
        { binding: 3, resource: volSampler },
        { binding: 4, resource: lightTex.createView() },
      ],
    }),
  );
  const bgBG = device.createBindGroup({
    label: 'pillars:bgBG',
    layout: bgPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: sceneBuf } }],
  });
  const nebulaBG = device.createBindGroup({
    label: 'pillars:nebulaBG',
    layout: nebulaPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: sceneBuf } },
      { binding: 1, resource: { buffer: starsBuf } },
      { binding: 2, resource: fieldTex.createView() },
      { binding: 3, resource: lightTex.createView() },
      { binding: 4, resource: volSampler },
      { binding: 5, resource: detailTex.createView() },
      { binding: 6, resource: detailSampler },
      { binding: 7, resource: skipTex.createView() },
    ],
  });
  const starBG = device.createBindGroup({
    label: 'pillars:starBG',
    layout: starPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: sceneBuf } },
      { binding: 1, resource: fieldTex.createView() },
      { binding: 2, resource: volSampler },
    ],
  });

  // ---- bakes -----------------------------------------------------------
  // Async and re-entrancy-guarded: frames drawn while a bake is in flight
  // just sample partially-written volumes (the textures start zeroed, so
  // the worst case is a nebula that fades in slab by slab).
  let baking = false;
  async function runBakes(seed: number): Promise<void> {
    if (baking) return;
    baking = true;
    try {
      // Seed → a noise-domain offset per slab buffer, all written before
      // any submit of this batch is recorded (queue-ordered, race-free).
      // The multipliers just spread integer seeds far apart in noise space.
      genSlabBufs.forEach((buf, i) => {
        const data = new ArrayBuffer(16);
        new Float32Array(data, 0, 3).set([seed * 12.9898, seed * 78.233, seed * 37.719]);
        new Uint32Array(data, 12, 1)[0] = i * SLAB_DEPTH;
        device.queue.writeBuffer(buf, 0, data);
      });
      const dispatchSlab = (
        pipe: GPUComputePipeline,
        bg: GPUBindGroup,
        label: string,
        gx: number,
        gy: number,
        gz: number,
      ): void => {
        const enc = device.createCommandEncoder({ label });
        const pass = enc.beginComputePass({ label });
        pass.setPipeline(pipe);
        pass.setBindGroup(0, bg);
        pass.dispatchWorkgroups(gx, gy, gz);
        pass.end();
        device.queue.submit([enc.finish()]);
      };
      const fineX = Math.ceil(VOLUME_DIMS[0] / WG);
      const fineY = Math.ceil(VOLUME_DIMS[1] / WG);
      const slabZ = Math.ceil(SLAB_DEPTH / WG);
      const coarseX = Math.ceil(COARSE_DIMS[0] / WG);
      const coarseY = Math.ceil(COARSE_DIMS[1] / WG);
      // Awaiting each slab keeps every command buffer's GPU time tiny
      // (watchdog headroom — see module header) at the cost of a few
      // round-trips, irrelevant for a boot-time bake.
      for (let s = 0; s < slabCount; s++) {
        dispatchSlab(genPipe, genBGs[s]!, `pillars:generate${s}`, fineX, fineY, slabZ);
        await device.queue.onSubmittedWorkDone();
      }
      // Empty-space-skip bake: occupancy (needs the whole field) then the
      // conservative distance field (needs the whole occupancy grid). Each
      // stage fully precedes the next via the awaited submits, so the
      // shared coarse-slab uniforms are never in flight for two readers.
      for (let s = 0; s < coarseSlabCount; s++) {
        dispatchSlab(occPipe, occBGs[s]!, `pillars:occupancy${s}`, coarseX, coarseY, slabZ);
        await device.queue.onSubmittedWorkDone();
      }
      for (let s = 0; s < coarseSlabCount; s++) {
        dispatchSlab(skipPipe, skipBGs[s]!, `pillars:skip${s}`, coarseX, coarseY, slabZ);
        await device.queue.onSubmittedWorkDone();
      }
      for (let s = 0; s < slabCount; s++) {
        dispatchSlab(bakePipe, bakeBGs[s]!, `pillars:bake${s}`, fineX, fineY, slabZ);
        await device.queue.onSubmittedWorkDone();
      }
    } finally {
      baking = false;
    }
  }
  function regenerate(seed: number): void {
    void runBakes(seed);
  }
  // Detail-noise bake: seed-independent, so exactly once at boot rather
  // than per regenerate. One dispatch is fine — 64^3 texels is the same
  // work as a single field z-slab, the empirically watchdog-safe unit.
  {
    const enc = device.createCommandEncoder({ label: 'pillars:generateDetail' });
    const pass = enc.beginComputePass({ label: 'pillars:generateDetail' });
    pass.setPipeline(detailPipe);
    pass.setBindGroup(0, detailBG);
    pass.dispatchWorkgroups(DETAIL_DIM / WG, DETAIL_DIM / WG, DETAIL_DIM / WG);
    pass.end();
    device.queue.submit([enc.finish()]);
  }
  regenerate(1);

  // ---- size-dependent targets: HDR scene + bloom pyramid ---------------
  let sceneTex: GPUTexture | null = null;
  let bloomMips: GPUTexture[] = [];
  let brightBG: GPUBindGroup;
  let downBG: GPUBindGroup[] = [];
  let upBG: GPUBindGroup[] = [];
  let compBG: GPUBindGroup;
  const RA_TB = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;

  function buildTargets(): void {
    const w = Math.max(1, Math.floor(canvas.width * settings.renderScale));
    const h = Math.max(1, Math.floor(canvas.height * settings.renderScale));
    sceneTex?.destroy();
    for (const m of bloomMips) m.destroy();
    sceneTex = device.createTexture({
      label: 'pillars:sceneTex',
      size: [w, h],
      format: HDR,
      usage: RA_TB,
    });
    bloomMips = [];
    let mw = Math.max(1, w >> 1);
    let mh = Math.max(1, h >> 1);
    for (let i = 0; i < BLOOM_MIPS; i++) {
      bloomMips.push(
        device.createTexture({
          label: `pillars:bloomMip${i}`,
          size: [mw, mh],
          format: HDR,
          usage: RA_TB,
        }),
      );
      device.queue.writeBuffer(
        mipTexelBufs[i]!,
        0,
        new Float32Array([1 / mw, 1 / mh, i === 0 ? 1 : 0, 0]),
      );
      mw = Math.max(1, mw >> 1);
      mh = Math.max(1, mh >> 1);
    }
    brightBG = device.createBindGroup({
      label: 'pillars:brightBG',
      layout: brightPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: linearSampler },
        { binding: 1, resource: sceneTex.createView() },
        { binding: 2, resource: { buffer: brightBuf } },
      ],
    });
    downBG = [];
    for (let i = 1; i < BLOOM_MIPS; i++) {
      downBG[i] = device.createBindGroup({
        label: `pillars:downBG${i}`,
        layout: downPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: linearSampler },
          { binding: 1, resource: bloomMips[i - 1]!.createView() },
          { binding: 2, resource: { buffer: mipTexelBufs[i - 1]! } },
        ],
      });
    }
    upBG = [];
    for (let i = 0; i < BLOOM_MIPS - 1; i++) {
      upBG[i] = device.createBindGroup({
        label: `pillars:upBG${i}`,
        layout: upPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: linearSampler },
          { binding: 1, resource: bloomMips[i + 1]!.createView() },
          { binding: 2, resource: { buffer: mipTexelBufs[i + 1]! } },
        ],
      });
    }
    compBG = device.createBindGroup({
      label: 'pillars:compBG',
      layout: compPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: linearSampler },
        { binding: 1, resource: sceneTex.createView() },
        { binding: 2, resource: bloomMips[0]!.createView() },
        { binding: 3, resource: { buffer: compBuf } },
      ],
    });
  }

  // ---- camera (orbit + pan) --------------------------------------------
  const cam = { az: -0.42, el: 0.1, dist: 5.8 };
  const camAnim = { ...cam };
  // Mutable pivot: LMB/1-finger orbits AROUND it; RMB/2-finger pan SLIDES
  // it in the camera's screen plane (see the pan() helper).
  const target: [number, number, number] = [0, -0.05, 0];
  const fovY = (40 * Math.PI) / 180;
  let autoRotate = true;
  let lastInteract = performance.now();
  // Last frame's world-space camera basis (drawFrame stashes it), so pan()
  // can move the pivot along screen right/up without recomputing it.
  let camRightW: [number, number, number] = [1, 0, 0];
  let camUpW: [number, number, number] = [0, 1, 0];

  const clampEl = (): void => {
    cam.el = Math.max(-1.25, Math.min(1.4, cam.el));
  };
  const clampDist = (): void => {
    cam.dist = Math.max(2.2, Math.min(20, cam.dist));
  };
  const orbit = (dx: number, dy: number): void => {
    cam.az -= dx * 0.006;
    cam.el += dy * 0.006;
    clampEl();
  };
  // Slide the pivot in the camera's screen plane. k is the world distance
  // one CSS pixel spans at the pivot depth (perspective 1:1 grab), so the
  // scene tracks the cursor at any zoom. Screen-right drag → scene right
  // (pivot moves left); screen-down drag → scene down.
  const pan = (dx: number, dy: number): void => {
    const k = (2 * cam.dist * Math.tan(fovY / 2)) / Math.max(1, canvas.clientHeight);
    target[0] += (-camRightW[0] * dx + camUpW[0] * dy) * k;
    target[1] += (-camRightW[1] * dx + camUpW[1] * dy) * k;
    target[2] += (-camRightW[2] * dx + camUpW[2] * dy) * k;
  };

  // Pointer-id → last position. Unifies mouse, pen and multi-touch: 1
  // active pointer orbits (or pans on RMB/MMB), 2 pointers pinch-zoom about
  // their centroid AND pan by the centroid's drift (native map-style gesture).
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let pinchCx = 0;
  let pinchCy = 0;
  const reseedPinch = (): void => {
    if (pointers.size < 2) {
      pinchDist = 0;
      return;
    }
    const pts = [...pointers.values()];
    const a = pts[0]!;
    const b = pts[1]!;
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    pinchCx = (a.x + b.x) / 2;
    pinchCy = (a.y + b.y) / 2;
  };

  // touch-action:none routes pinch/scroll gestures to pointer events rather
  // than letting the browser page-zoom or scroll the canvas away.
  canvas.style.touchAction = 'none';

  const onDown = (e: PointerEvent): void => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture?.(e.pointerId);
    reseedPinch();
    lastInteract = performance.now();
  };
  const onMove = (e: PointerEvent): void => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const px = e.clientX;
    const py = e.clientY;

    if (pointers.size >= 2) {
      p.x = px;
      p.y = py;
      const pts = [...pointers.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      if (pinchDist > 0) {
        // Spread apart (dist grows) → zoom in (cam.dist shrinks).
        cam.dist *= Math.exp((pinchDist - dist) * 0.005);
        clampDist();
        pan(cx - pinchCx, cy - pinchCy);
      }
      pinchDist = dist;
      pinchCx = cx;
      pinchCy = cy;
      lastInteract = performance.now();
      return;
    }

    const dx = px - p.x;
    const dy = py - p.y;
    p.x = px;
    p.y = py;
    // RMB (bit 2) or MMB (bit 4) pans; anything else (LMB, touch, pen) orbits.
    if ((e.buttons & 2) !== 0 || (e.buttons & 4) !== 0) {
      pan(dx, dy);
    } else {
      orbit(dx, dy);
    }
    lastInteract = performance.now();
  };
  const onUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    reseedPinch();
    lastInteract = performance.now();
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    cam.dist *= Math.exp(e.deltaY * 0.0011);
    clampDist();
    lastInteract = performance.now();
  };
  // Suppress the RMB context menu so right-drag can pan uninterrupted.
  const onContextMenu = (e: Event): void => e.preventDefault();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  // ---- resize ----------------------------------------------------------
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize(): void {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    buildTargets();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ---- frame loop ------------------------------------------------------
  let raf = 0;
  let running = true;
  let prev = performance.now();
  const bootMs = prev;
  let frame = 0;
  let fpsAcc = 0;
  let fpsN = 0;
  let fpsT = 0;
  const sceneData = new Float32Array(40);
  const compData = new Float32Array(8);

  function drawFrame(now: number): void {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    frame = (frame + 1) % 1e6;
    if (autoRotate && now - lastInteract > 3000 && pointers.size === 0) cam.az += dt * 0.06;
    const k = Math.min(1, dt * 10);
    camAnim.az += (cam.az - camAnim.az) * k;
    camAnim.el += (cam.el - camAnim.el) * k;
    camAnim.dist += (cam.dist - camAnim.dist) * k;

    const ce = Math.cos(camAnim.el);
    const eye: [number, number, number] = [
      target[0] + Math.sin(camAnim.az) * ce * camAnim.dist,
      target[1] + Math.sin(camAnim.el) * camAnim.dist,
      target[2] + Math.cos(camAnim.az) * ce * camAnim.dist,
    ];
    // Camera basis, shared by the raster path (viewProj) and the
    // fullscreen ray reconstruction (see lib/scene.wesl).
    const fwd = norm3(sub3(target, eye));
    const right = norm3(cross3(fwd, [0, 1, 0]));
    const up = cross3(right, fwd);
    // Stash for the pan handlers (next pointer move slides the pivot here).
    camRightW = right;
    camUpW = up;
    const view = mat4.lookAt(eye, [target[0], target[1], target[2]], [0, 1, 0]);
    const proj = mat4.perspective(fovY, canvas.width / canvas.height, 0.05, 100);
    const viewProj = mat4.multiply(proj, view) as Float32Array;

    packSceneUniforms(
      {
        viewProj,
        camPos: eye,
        camRight: right,
        camUp: up,
        camFwd: fwd,
        tanHalfFov: Math.tan(fovY / 2),
        aspect: canvas.width / canvas.height,
        timeSec: (now - bootMs) / 1000,
        frame,
        densityMul: settings.densityMul,
        emissionMul: settings.emissionMul,
        scatterMul: settings.scatterMul,
        ambientMul: settings.ambientMul,
        starBrightness: settings.starBrightness,
        phaseG: settings.phaseG,
        detailErosion: settings.detailErosion,
        detailScale: settings.detailScale,
      },
      sceneData,
    );
    device.queue.writeBuffer(sceneBuf, 0, sceneData);
    compData[0] = settings.exposure;
    compData[1] = settings.bloom;
    compData[2] = settings.saturation;
    compData[3] = settings.vignette;
    compData[4] = settings.tonemap;
    compData[5] = frame;
    device.queue.writeBuffer(compBuf, 0, compData);

    const enc = device.createCommandEncoder({ label: 'pillars:frame' });
    // Scene: background → volume → stars, one HDR pass.
    {
      const pass = enc.beginRenderPass({
        label: 'pillars:scenePass',
        colorAttachments: [
          {
            view: sceneTex!.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(bgPipe);
      pass.setBindGroup(0, bgBG);
      pass.draw(3);
      pass.setPipeline(nebulaPipe);
      pass.setBindGroup(0, nebulaBG);
      pass.draw(36);
      pass.setPipeline(starPipe);
      pass.setBindGroup(0, starBG);
      pass.setVertexBuffer(0, starVB);
      pass.draw(6, starCount);
      pass.end();
    }
    // Bloom pyramid: bright → down chain → additive up chain.
    {
      const pass = enc.beginRenderPass({
        label: 'pillars:brightPass',
        colorAttachments: [
          {
            view: bloomMips[0]!.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      pass.setPipeline(brightPipe);
      pass.setBindGroup(0, brightBG);
      pass.draw(3);
      pass.end();
    }
    for (let i = 1; i < BLOOM_MIPS; i++) {
      const pass = enc.beginRenderPass({
        label: `pillars:downPass${i}`,
        colorAttachments: [
          {
            view: bloomMips[i]!.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      pass.setPipeline(downPipe);
      pass.setBindGroup(0, downBG[i]!);
      pass.draw(3);
      pass.end();
    }
    for (let i = BLOOM_MIPS - 2; i >= 0; i--) {
      const pass = enc.beginRenderPass({
        label: `pillars:upPass${i}`,
        colorAttachments: [{ view: bloomMips[i]!.createView(), loadOp: 'load', storeOp: 'store' }],
      });
      pass.setPipeline(upPipe);
      pass.setBindGroup(0, upBG[i]!);
      pass.draw(3);
      pass.end();
    }
    // Composite (+ upscale) → canvas.
    {
      const pass = enc.beginRenderPass({
        label: 'pillars:compositePass',
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      pass.setPipeline(compPipe);
      pass.setBindGroup(0, compBG);
      pass.draw(3);
      pass.end();
    }
    device.queue.submit([enc.finish()]);

    fpsAcc += dt;
    fpsN++;
    fpsT += dt;
    if (fpsT >= 0.5) {
      opts.onFps?.(Math.round(fpsN / fpsAcc));
      fpsAcc = 0;
      fpsN = 0;
      fpsT = 0;
    }
  }

  function loop(now: number): void {
    if (!running) return;
    drawFrame(now);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    setSettings(patch: Partial<PillarsSettings>): void {
      const scaleBefore = settings.renderScale;
      Object.assign(settings, patch);
      if (settings.renderScale !== scaleBefore) buildTargets();
    },
    regenerate,
    setAutoRotate(on: boolean): void {
      autoRotate = on;
    },
    // Offscreen composite + readback — the machine-verification hook (see
    // PillarsEngineHandle). Mirrors the galaxy-renderer's grab(): draw the
    // existing composite bind group into a copyable texture, then
    // copyTextureToBuffer + mapAsync. bytesPerRow must be 256-aligned per
    // WebGPU spec, hence the row stride dance on unpack.
    async grab(size?: number): Promise<{ size: number; data: Uint8ClampedArray }> {
      const S = size ?? 256;
      const tex = device.createTexture({
        label: 'pillars:grabTex',
        size: [S, S],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const bpr = Math.ceil((S * 4) / 256) * 256;
      const buf = device.createBuffer({
        label: 'pillars:grabBuf',
        size: bpr * S,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const enc = device.createCommandEncoder({ label: 'pillars:grab' });
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: tex.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      pass.setPipeline(compPipe);
      pass.setBindGroup(0, compBG);
      pass.draw(3);
      pass.end();
      enc.copyTextureToBuffer(
        { texture: tex },
        { buffer: buf, bytesPerRow: bpr, rowsPerImage: S },
        [S, S, 1],
      );
      device.queue.submit([enc.finish()]);
      await buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buf.getMappedRange());
      const out = new Uint8ClampedArray(S * S * 4);
      const bgra = format.startsWith('bgra');
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const si = y * bpr + x * 4;
          const di = (y * S + x) * 4;
          out[di] = src[si + (bgra ? 2 : 0)]!;
          out[di + 1] = src[si + 1]!;
          out[di + 2] = src[si + (bgra ? 0 : 2)]!;
          out[di + 3] = 255;
        }
      }
      buf.unmap();
      buf.destroy();
      tex.destroy();
      return { size: S, data: out };
    },
    dispose(): void {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}

// Tiny vec3 helpers — three call sites, not worth a dependency.
function sub3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm3(a: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
