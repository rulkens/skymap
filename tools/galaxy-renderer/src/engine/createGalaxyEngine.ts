/**
 * createGalaxyEngine — the one GPU-orchestration module. Owns the WebGPU
 * device, every pipeline and buffer, the orbit camera + input, and the
 * per-frame render loop. A straight port of the spike's `galaxy-engine.js`
 * (`createGalaxyRenderer`), with all math delegated to the five tested pure
 * helpers and all seven shaders pulled in as build-time-linked WESL strings.
 *
 * ## The pass chain
 *
 * Generation is no longer a per-frame step. `setParams` dispatches it ONCE,
 * whenever the caller changes the central galaxy's params — not on every
 * `requestAnimationFrame` — as a pair of compute passes
 * (`createGenerationPipelines.ts` builds the pipelines, `encodeGeneration.ts`
 * records the dispatches) that write directly into the star/dust vertex
 * buffers the frame loop already draws from. It shares this module's one
 * `GPUQueue` with every subsequent `drawFrame`, so "the new galaxy is ready
 * before it's drawn" is a queue-ordering guarantee, not something the render
 * loop waits on — see `setParams`'s docblock for why no readback is needed.
 * Background extras (`setExtras`) dispatch the same way: one compute pair per
 * extra, each with its own params AND its own world transform folded into its
 * UBO — see "Why extras fold their transform into generation" below.
 *
 *   setParams(p) ──► genStars / genDust compute passes ──► star VB / dust VB
 *                     (one queue.submit, no CPU readback)
 *                              │
 *                              ▼ (every later drawFrame, same queue)
 *   ┌─ scene pass (HDR, clear black) ──────────────────────────────────┐
 *   │   star pipe  (additive one/one) : central galaxy + every extra   │
 *   │   dust pipe  (transmittance)    : central galaxy + every extra   │
 *   └──────────────────────────────────────────────────────────────────┘
 *                              │ sceneTex (rgba16float)
 *                              ▼
 *   bright pass  ──► bloom mip 0 (half-res, thresholded, Karis-flagged)
 *                              │
 *   downsample 1..4  ──► ever-coarser mips (progressively wider glow)
 *                              │
 *   upsample 3..0  (loadOp 'load', additive) ──► fold each coarse mip
 *                              │                  back onto the finer one
 *                              ▼
 *   composite pass ──► canvas : sceneTex + bloomMip0, exposure → tonemap
 *                              → saturation → vignette → gamma
 *
 * There is no depth attachment: stars are additive (order-independent) and
 * dust is order-independent transmittance, so nothing needs a Z buffer. That
 * is also why the projection's [0,1] vs [-1,1] depth convention is
 * cosmetic here — see the `proj` construction below.
 *
 * ## Why extras fold their transform into generation
 *
 * Each background galaxy folds its full world transform into generation: its
 * per-extra UBO carries the rigid transform + size scale in the extra lanes
 * (`packGenerationUniforms`), and the compute passes place every star/dust
 * record in world space as their final write step (`applyExtraTransform` in
 * `lib/generate.wesl`). The vertex buffer that comes out is already
 * world-placed, so drawing an extra is a plain instanced `draw` against its
 * own buffers — no per-draw model-matrix uniform, and nothing rewritten after
 * the generation submit.
 *
 * The alternative — one shared subject buffer plus a per-draw model matrix
 * mutated between draw calls — is the standing writeBuffer-vs-submit ordering
 * trap: interleaving `queue.writeBuffer` with `queue.submit` in a frame does
 * not guarantee the write lands before the matching draw reads it, so the
 * first extra to draw would read stale bytes and paint on top of the wrong
 * galaxy. Folding the transform in at generation time is even further from
 * that trap than a post-generation bake would be: the transform is applied
 * once, inline, as the record is first written, so the world-space bytes are
 * never rewritten at all — there is no second write for a draw to race.
 *
 * ## Deviations from the spike, sanctioned by the plan
 *
 *  - `mat4.perspective` (wgpu-matrix) maps depth to [0, 1] (WebGPU
 *    convention) where the spike's hand-rolled matrix used GL's [-1, 1].
 *    With no depth attachment, z only affects near/far clipping — visually
 *    identical, and [0,1] is the correct convention for this API. Do not
 *    "restore" the spike matrix.
 *  - The loop is a continuous `requestAnimationFrame`, not render-on-demand:
 *    this is a visual-tuning instrument that always animates (idle
 *    auto-rotate, damped camera), so gating renders on dirty state would buy
 *    nothing.
 *  - `starCount`/`dustCount` are the carved layouts' CAPACITIES
 *    (`GenerationLayout.capacity`), not a count of "live" (visibly nonzero)
 *    records — see `setParams`'s docblock.
 *  - Byte-compat with the CPU model (`generateGalaxy`) is waived for the
 *    central galaxy: the GPU passes derive every star/dust draw from a
 *    stateless per-invocation hash rather than replaying the CPU's serial
 *    RNG stream (see `lib/generate.wesl`'s header), so the two produce
 *    statistically similar but not byte-identical galaxies for the same
 *    `seed`. The determinism contract that DOES hold is CPU-free: same
 *    params in, same GPU buffer contents out, every time.
 */
import { mat4 } from 'wgpu-matrix';

import type { GalaxyEngineHandle } from '../../@types/engine/GalaxyEngineHandle';
import type { GalaxyEngineOptions } from '../../@types/engine/GalaxyEngineOptions';
import type { GalaxyParams } from '../../@types/model/GalaxyParams';
import type { RenderSettings } from '../../@types/engine/RenderSettings';
import type { LodSettings } from '../../@types/engine/LodSettings';
import type { ViewPose } from '../../@types/engine/ViewPose';
import type { ExtraGalaxySpec } from '../../@types/engine/ExtraGalaxySpec';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';

import { orbitEye } from './orbitEye';
import { panAxes } from './panAxes';
import { lensShift } from './lensShift';
import { packCameraUniforms } from './packCameraUniforms';
import { createGenerationPipelines } from './createGenerationPipelines';
import { encodeGeneration } from './encodeGeneration';
import { packGenerationUniforms } from './packGenerationUniforms';
import { GENERATION_UBO } from './generationUboLayout';
import { carveStarLayout } from '../model/carveStarLayout';
import { carveDustLayout } from '../model/carveDustLayout';
import { classifyHubbleType } from '../model/classifyHubbleType';
import { splitStarBudget } from '../model/splitStarBudget';

import starWgsl from './shaders/star.wesl?static';
import dustWgsl from './shaders/dust.wesl?static';
import brightWgsl from './shaders/bloomBright.wesl?static';
import downsampleWgsl from './shaders/bloomDownsample.wesl?static';
import upsampleWgsl from './shaders/bloomUpsample.wesl?static';
import compositeWgsl from './shaders/composite.wesl?static';

/** Multi-scale (mip pyramid) bloom: N downsample levels. galaxy-engine.js:32. */
const BLOOM_MIPS = 5;

/** HDR working format for the scene + bloom pyramid. galaxy-engine.js:17. */
const HDR: GPUTextureFormat = 'rgba16float';

/**
 * Bytes per generated star/dust record: 8 f32 lanes (`x,y,z,r,g,b,size,
 * brightness` for stars; `x,y,z,size,r,g,b,opacity` for dust — different
 * field order, same stride). Mirrors `lib/generate.wesl`'s stride-8 output
 * storage array and the star/dust render pipelines' `arrayStride: 32`
 * instance layouts above — all three must agree byte-for-byte.
 */
const GEN_RECORD_BYTES = 32;

/**
 * A single generated extra galaxy: its GPU-filled star/dust vertex buffers,
 * their instance counts, and the per-extra UBO the generation passes read.
 * The UBO is retained (not destroyed right after the generation submit) so its
 * lifetime brackets the vertex buffers it produced — the whole triple is torn
 * down together on the next `setExtras`.
 */
type Extra = {
  starBuf: GPUBuffer;
  starCount: number;
  dustBuf: GPUBuffer | null;
  dustCount: number;
  ubo: GPUBuffer;
};

export async function createGalaxyEngine(
  canvas: HTMLCanvasElement,
  opts: GalaxyEngineOptions = {},
): Promise<GalaxyEngineHandle> {
  // ---- device + canvas (galaxy-engine.js:10-17) ----
  if (!navigator.gpu) throw new Error('no-webgpu');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no-adapter');
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu') as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  // ---- static fullscreen-billboard quad (galaxy-engine.js:20-22) ----
  const quad = device.createBuffer({
    label: 'galaxy:quad',
    size: 6 * 2 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(quad.getMappedRange()).set([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
  quad.unmap();

  // ---- uniform buffers (galaxy-engine.js:25-34) ----
  const camBuf = device.createBuffer({
    label: 'galaxy:cam',
    size: 112,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const brightBuf = device.createBuffer({
    label: 'galaxy:bright',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const compBuf = device.createBuffer({
    label: 'galaxy:composite',
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // One texel-size uniform per bloom level: [1/w, 1/h, karisFlag, 0].
  const mipTexelBufs = Array.from({ length: BLOOM_MIPS }, (_, i) =>
    device.createBuffer({
      label: `galaxy:mipTexel${i}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
  );
  // bright-pass prefilter: x = threshold, y = knee. Seeded once.
  device.queue.writeBuffer(brightBuf, 0, new Float32Array([0.22, 0.5, 0, 0]));

  const sampler = device.createSampler({
    label: 'galaxy:sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const makeShader = (code: string, label: string): GPUShaderModule =>
    createShaderModuleWithDevLog(device, code, label);

  // ---- star pipeline (additive billboards) — galaxy-engine.js:39-56 ----
  const starMod = makeShader(starWgsl, 'galaxy:star');
  const starPipe = device.createRenderPipeline({
    label: 'galaxy:starPipe',
    layout: 'auto',
    vertex: {
      module: starMod,
      entryPoint: 'vs',
      buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
        {
          arrayStride: 32,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x3' },
            { shaderLocation: 2, offset: 12, format: 'float32x3' },
            { shaderLocation: 3, offset: 24, format: 'float32x2' },
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

  // ---- dust pipeline (transmittance billboards) — galaxy-engine.js:58-76 ----
  const dustMod = makeShader(dustWgsl, 'galaxy:dust');
  const dustPipe = device.createRenderPipeline({
    label: 'galaxy:dustPipe',
    layout: 'auto',
    vertex: {
      module: dustMod,
      entryPoint: 'vs',
      buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
        {
          arrayStride: 32,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x3' },
            { shaderLocation: 2, offset: 12, format: 'float32' },
            { shaderLocation: 3, offset: 16, format: 'float32x3' },
            { shaderLocation: 4, offset: 28, format: 'float32' },
          ],
        },
      ],
    },
    fragment: {
      module: dustMod,
      entryPoint: 'fs',
      targets: [
        {
          format: HDR,
          blend: {
            color: { srcFactor: 'dst', dstFactor: 'zero', operation: 'add' },
            alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  // ---- post pipelines (galaxy-engine.js:78-93) ----
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
  const brightPipe = mkPost(brightWgsl, 'galaxy:brightPipe', HDR); // scene -> pyramid level 0
  const downPipe = mkPost(downsampleWgsl, 'galaxy:downPipe', HDR); // level i-1 -> level i
  // upsample folds level i+1 additively onto level i.
  const upMod = makeShader(upsampleWgsl, 'galaxy:upsample');
  const upPipe = device.createRenderPipeline({
    label: 'galaxy:upPipe',
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
  const compPipe = mkPost(compositeWgsl, 'galaxy:compPipe', format);

  // ---- generation pipelines + UBO (compute dispatch — see setParams below) ----
  // One `genUbo` buffer for the CENTRAL galaxy only: `setParams` rewrites it
  // in place on every regeneration. Each extra (background galaxy) dispatches
  // with its OWN params and world transform, so it gets its own per-extra UBO
  // built in `setExtras` — one shared buffer can't serve them, since packing N
  // extras into one submit would need N distinct UBO contents live at once.
  const genPipelines = createGenerationPipelines(device);
  const genUbo = device.createBuffer({
    label: 'galaxy:genUbo',
    size: GENERATION_UBO.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ---- tiny readback target for headless verification (galaxy-engine.js:96-97) ----
  const debugTex = device.createTexture({
    label: 'galaxy:debugTex',
    size: [64, 64],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const dbgBuf = device.createBuffer({
    label: 'galaxy:debugBuf',
    size: 64 * 256,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // ---- instance buffers (recreated on setParams) — galaxy-engine.js:100-102 ----
  let starBuf: GPUBuffer | null = null;
  let starCount = 0;
  let dustBuf: GPUBuffer | null = null;
  let dustCount = 0;
  let extras: Extra[] = []; // background galaxies, each GPU-generated in world space

  // Per-pipeline bind groups: `layout:'auto'` groups are pipeline-specific and
  // never cross pipelines, so the SAME cam buffer needs one group for the star
  // pipe and a separate one for the dust pipe. (galaxy-engine.js:117-118)
  const camBG = device.createBindGroup({
    label: 'galaxy:camBG-star',
    layout: starPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: camBuf } }],
  });
  const camBGdust = device.createBindGroup({
    label: 'galaxy:camBG-dust',
    layout: dustPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: camBuf } }],
  });

  // ---- size-dependent targets: HDR scene + bloom mip pyramid ----
  let sceneTex: GPUTexture;
  let bloomMips: GPUTexture[] = [];
  let brightBG: GPUBindGroup;
  let downBG: GPUBindGroup[] = [];
  let upBG: GPUBindGroup[] = [];
  let compBG: GPUBindGroup;
  const RA_TB = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;

  function buildTargets(): void {
    const w = canvas.width;
    const h = canvas.height;
    if (sceneTex) sceneTex.destroy();
    for (const m of bloomMips) m.destroy();
    sceneTex = device.createTexture({
      label: 'galaxy:sceneTex',
      size: [w, h],
      format: HDR,
      usage: RA_TB,
    });
    // Pyramid: level 0 = half-res, each further level halves again -> ever-wider glow.
    bloomMips = [];
    let mw = Math.max(1, w >> 1);
    let mh = Math.max(1, h >> 1);
    for (let i = 0; i < BLOOM_MIPS; i++) {
      const levelW = Math.max(1, mw);
      const levelH = Math.max(1, mh);
      bloomMips.push(
        device.createTexture({
          label: `galaxy:bloomMip${i}`,
          size: [levelW, levelH],
          format: HDR,
          usage: RA_TB,
        }),
      );
      device.queue.writeBuffer(
        mipTexelBufs[i]!,
        0,
        new Float32Array([1 / levelW, 1 / levelH, i === 0 ? 1 : 0, 0]),
      );
      mw = Math.max(1, mw >> 1);
      mh = Math.max(1, mh >> 1);
    }
    // bright-pass: scene -> level 0
    brightBG = device.createBindGroup({
      label: 'galaxy:brightBG',
      layout: brightPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: sceneTex.createView() },
        { binding: 2, resource: { buffer: brightBuf } },
      ],
    });
    // downsample: produce level i from level i-1 (uses i-1's texel size)
    downBG = [];
    for (let i = 1; i < BLOOM_MIPS; i++) {
      downBG[i] = device.createBindGroup({
        label: `galaxy:downBG${i}`,
        layout: downPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: bloomMips[i - 1]!.createView() },
          { binding: 2, resource: { buffer: mipTexelBufs[i - 1]! } },
        ],
      });
    }
    // upsample: fold level i+1 additively back onto level i (uses i+1's texel size)
    upBG = [];
    for (let i = 0; i < BLOOM_MIPS - 1; i++) {
      upBG[i] = device.createBindGroup({
        label: `galaxy:upBG${i}`,
        layout: upPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: bloomMips[i + 1]!.createView() },
          { binding: 2, resource: { buffer: mipTexelBufs[i + 1]! } },
        ],
      });
    }
    // composite: scene + accumulated bloom (level 0)
    compBG = device.createBindGroup({
      label: 'galaxy:compBG',
      layout: compPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: sceneTex.createView() },
        { binding: 2, resource: bloomMips[0]!.createView() },
        { binding: 3, resource: { buffer: compBuf } },
      ],
    });
  }

  // ---- camera state (orbit) — galaxy-engine.js:159-166 ----
  const cam = { az: 0.5, el: 1.05, dist: 31, target: [0, 0, 0] as Vec3, fov: (45 * Math.PI) / 180 };
  const camAnim = { az: cam.az, el: cam.el, dist: cam.dist }; // damped shadow copy
  let autoRotate = opts.autoRotate !== false;
  let insetL = 0;
  let insetR = 0; // CSS px occupied by side panels (for off-center framing)
  let lastInteract = performance.now();

  // One internal render bag merged by setRender (the spike's Object.assign).
  const render = {
    exposure: 0.92,
    bloom: 0.85,
    saturation: 1.26,
    vignette: 0.5,
    sizeScale: 1.0,
    starIntensity: 0.11,
    tonemap: 0 as number,
    lodApparent: 0,
    cullBright: 0,
  };

  // Reused scratch for the per-frame uniform packs — no per-frame allocation.
  const camData = new Float32Array(28);
  const compData = new Float32Array(8);

  /**
   * setParams — regenerate the central galaxy as a GPU compute dispatch
   * instead of an awaited worker round-trip. Carving the layouts is cheap
   * pure arithmetic (`splitStarBudget`/`carveStarLayout`/`carveDustLayout`),
   * so it runs directly on the caller's thread; the actual star/dust MATH
   * (bulge/disk/arm placement, colour, HII knots, ...) happens on the GPU
   * inside `encodeGeneration`'s two compute passes, ported in plan 01.
   *
   * `starBuf`/`dustBuf` are sized to the carved CAPACITY
   * (`GenerationLayout.capacity`), not a "how many stars will actually be
   * visible" count — a population's `iterations` is its CPU builder's loop
   * bound, and some iterations write a zero-brightness/opacity record (an
   * arm star past its fade radius, say) without shrinking the layout. The
   * compute pass fills every capacity slot (dead ones included), and the
   * render pipelines below draw all of them: a dead slot rasterizes nothing,
   * so nothing is drawn wrong — it just costs a few zero-alpha billboards.
   * `starCount`/`dustCount` (the instance counts every `draw` call below
   * uses) are therefore set to the capacities.
   *
   * The write order — `queue.writeBuffer(genUbo, ...)`, THEN record the
   * compute passes into a fresh encoder, THEN `queue.submit` — is what makes
   * this safe on one shared `GPUQueue` without a readback: WebGPU processes
   * everything enqueued on a queue in submission order, so by the time this
   * submit's compute passes run on the GPU, the preceding `writeBuffer` has
   * already landed. That is NOT the same shape as the standing
   * writeBuffer-vs-submit trap documented in the module header ("Why extras
   * are baked") — that trap is multiple writeBuffer/submit pairs racing to
   * mutate ONE shared buffer read by draws recorded at different times; here
   * there is exactly one write, one encoder, one submit, for a buffer
   * nothing else touches concurrently. The same ordering guarantee is why the
   * promise can resolve right after `submit`, with no `mapAsync` wait: any
   * `drawFrame` encoded afterwards shares this queue too, so its draws are
   * guaranteed to run after this submit's writes land.
   *
   * `opts.onStats` reports PLANNED counts, not live ones: the sum of each
   * star population's `iterations` (not `iterations * stride` — that would
   * double-count the worst-case HII-bonus slots most iterations never use),
   * plus the full dust capacity (dust ranges are all stride 1, so capacity
   * IS its planned count). Actual live counts differ by a few percent, the
   * same slack `iterations` always carried against its builder's real output
   * (see `PopulationRange`'s docblock) — a HUD estimate, not an exact tally.
   */
  async function setParams(p: GalaxyParams): Promise<void> {
    const category = classifyHubbleType(p.type);
    const budget = splitStarBudget(category, p);
    const starLayout = carveStarLayout(category, p, budget);
    const dustLayout = carveDustLayout(category, p, budget);

    if (starBuf) starBuf.destroy();
    // A zero-capacity star layout is not expected in practice (every
    // category's split puts at least some stars in bulge/disk/halo), but a
    // zero-size GPUBuffer is invalid, so clamp to one record just in case.
    starBuf = device.createBuffer({
      label: 'galaxy:starVB',
      size: Math.max(1, starLayout.capacity) * GEN_RECORD_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
    });
    starCount = starLayout.capacity;

    if (dustBuf) dustBuf.destroy();
    if (dustLayout.capacity > 0) {
      dustBuf = device.createBuffer({
        label: 'galaxy:dustVB',
        size: dustLayout.capacity * GEN_RECORD_BYTES,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
      });
    } else {
      dustBuf = null;
    }
    dustCount = dustLayout.capacity;

    device.queue.writeBuffer(genUbo, 0, packGenerationUniforms(p, budget, null));

    const enc = device.createCommandEncoder({ label: 'galaxy:generate' });
    encodeGeneration({
      device,
      encoder: enc,
      pipelines: genPipelines,
      ubo: genUbo,
      starBuf,
      starLayout,
      dustBuf,
      dustLayout,
    });
    device.queue.submit([enc.finish()]);

    const plannedStars = starLayout.ranges.reduce((sum, r) => sum + r.iterations, 0);
    opts.onStats?.({ stars: plannedStars, dust: dustLayout.capacity });
  }

  function setRender(patch: Partial<RenderSettings & LodSettings>): void {
    Object.assign(render, patch);
  }

  // Replace the set of background galaxies. Each extra is generated GPU-side
  // exactly like the central galaxy in `setParams`, but with its own params
  // and its own rigid world transform folded into its per-extra UBO: carve the
  // layouts from `spec.params`, allocate that extra's `VERTEX | STORAGE`
  // star/dust buffers, pack `packGenerationUniforms(spec.params, budget, spec)`
  // (the transform + size scale ride the UBO's extra lanes, so the compute
  // passes emit records already placed in the scene), then `encodeGeneration`
  // into ONE shared encoder for every extra and submit once.
  //
  // The whole body is synchronous up to that single submit — no `await` splits
  // the destroy-old / build-new sequence, so replacing the extras is atomic per
  // call and needs no interleaving guard: the old buffers are torn down and the
  // new ones built with nothing able to run in between. The `async` signature
  // is kept only because `GalaxyEngineHandle` declares it; nothing is awaited.
  async function setExtras(specs: readonly ExtraGalaxySpec[]): Promise<void> {
    for (const e of extras) {
      e.starBuf.destroy();
      e.dustBuf?.destroy();
      e.ubo.destroy();
    }
    extras = [];

    const enc = device.createCommandEncoder({ label: 'galaxy:generateExtras' });
    for (const spec of specs) {
      const category = classifyHubbleType(spec.params.type);
      const budget = splitStarBudget(category, spec.params);
      const starLayout = carveStarLayout(category, spec.params, budget);
      const dustLayout = carveDustLayout(category, spec.params, budget);

      // Same clamp as `setParams`: a zero-capacity star layout isn't expected,
      // but a zero-size GPUBuffer is invalid, so floor the size at one record.
      const starBufExtra = device.createBuffer({
        label: 'galaxy:extraStarVB',
        size: Math.max(1, starLayout.capacity) * GEN_RECORD_BYTES,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
      });
      let dustBufExtra: GPUBuffer | null = null;
      if (dustLayout.capacity > 0) {
        dustBufExtra = device.createBuffer({
          label: 'galaxy:extraDustVB',
          size: dustLayout.capacity * GEN_RECORD_BYTES,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
        });
      }

      const ubo = device.createBuffer({
        label: 'galaxy:extraGenUbo',
        size: GENERATION_UBO.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(ubo, 0, packGenerationUniforms(spec.params, budget, spec));

      encodeGeneration({
        device,
        encoder: enc,
        pipelines: genPipelines,
        ubo,
        starBuf: starBufExtra,
        starLayout,
        dustBuf: dustBufExtra,
        dustLayout,
      });

      extras.push({
        starBuf: starBufExtra,
        starCount: starLayout.capacity,
        dustBuf: dustBufExtra,
        dustCount: dustLayout.capacity,
        ubo,
      });
    }
    device.queue.submit([enc.finish()]);
  }

  function setView(pose: Partial<ViewPose>): void {
    if (pose.az != null) cam.az = pose.az;
    if (pose.el != null) cam.el = pose.el;
    if (pose.dist != null) cam.dist = pose.dist;
    lastInteract = performance.now();
  }

  function setAutoRotate(on: boolean): void {
    autoRotate = on;
  }

  function setInsets(left: number, right: number): void {
    insetL = left || 0;
    insetR = right || 0;
  }

  // ---- input (galaxy-engine.js:225-250) ----
  let dragging = false;
  let panning = false;
  let lx = 0;
  let ly = 0;
  const onDown = (e: PointerEvent): void => {
    dragging = true;
    panning = e.button === 2 || e.button === 1;
    lx = e.clientX;
    ly = e.clientY;
    lastInteract = performance.now();
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    if (panning) {
      // Right/middle-drag pans: shift the orbit target along the camera's right & up axes.
      const { right, up } = panAxes(camAnim.az, camAnim.el);
      const s = camAnim.dist * 0.0016; // screen-constant pan speed
      const dx = (e.clientX - lx) * s;
      const dy = (e.clientY - ly) * s;
      for (let i = 0; i < 3; i++) cam.target[i] = cam.target[i]! + (-right[i]! * dx + up[i]! * dy);
    } else {
      cam.az += (e.clientX - lx) * 0.006;
      cam.el += (e.clientY - ly) * 0.006;
      cam.el = Math.max(-1.5, Math.min(1.5, cam.el));
    }
    lx = e.clientX;
    ly = e.clientY;
    lastInteract = performance.now();
  };
  const onUp = (): void => {
    dragging = false;
    panning = false;
    lastInteract = performance.now();
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    cam.dist *= Math.exp(e.deltaY * 0.0011);
    cam.dist = Math.max(3, Math.min(400, cam.dist));
    lastInteract = performance.now();
  };
  const onContextMenu = (e: Event): void => e.preventDefault(); // allow right-drag to pan
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  // ---- resize (galaxy-engine.js:253-264) ----
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // full native resolution
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

  // ---- frame loop (galaxy-engine.js:266-345) ----
  let raf = 0;
  let running = true;
  let prev = performance.now();
  let fpsAcc = 0;
  let fpsN = 0;
  let fpsT = 0;

  function drawFrame(now: number): void {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    // idle auto-rotate
    if (autoRotate && now - lastInteract > 2500 && !dragging) cam.az += dt * 0.12;
    // damping
    const k = Math.min(1, dt * 10);
    camAnim.az += (cam.az - camAnim.az) * k;
    camAnim.el += (cam.el - camAnim.el) * k;
    camAnim.dist += (cam.dist - camAnim.dist) * k;

    const eye = orbitEye(camAnim.az, camAnim.el, camAnim.dist, cam.target);
    const view = mat4.lookAt(eye, cam.target, [0, 1, 0]);
    // Depth maps to [0, 1] (WebGPU); no depth attachment, so this is cosmetic. See header.
    const proj = mat4.perspective(cam.fov, canvas.width / canvas.height, 0.1, 400);
    proj[8] = lensShift(insetL, insetR, canvas.clientWidth); // lens shift to centre in the visible area
    const vp = mat4.multiply(proj, view);

    packCameraUniforms(
      vp,
      view,
      {
        sizeScale: render.sizeScale,
        starIntensity: render.starIntensity,
        lodApparent: render.lodApparent,
        cullBright: render.cullBright,
      },
      camData,
    );
    device.queue.writeBuffer(camBuf, 0, camData);
    compData[0] = render.exposure;
    compData[1] = render.bloom;
    compData[2] = render.saturation;
    compData[3] = render.vignette;
    compData[4] = render.tonemap;
    device.queue.writeBuffer(compBuf, 0, compData);

    const enc = device.createCommandEncoder({ label: 'galaxy:frame' });
    // scene: additive stars (central + extras) then transmittance dust (central + extras)
    {
      const pass = enc.beginRenderPass({
        label: 'galaxy:scenePass',
        colorAttachments: [
          {
            view: sceneTex.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(starPipe);
      pass.setBindGroup(0, camBG);
      pass.setVertexBuffer(0, quad);
      if (starBuf) {
        pass.setVertexBuffer(1, starBuf);
        pass.draw(6, starCount);
      }
      for (const e of extras) {
        pass.setVertexBuffer(1, e.starBuf);
        pass.draw(6, e.starCount);
      }
      pass.setPipeline(dustPipe);
      pass.setBindGroup(0, camBGdust);
      pass.setVertexBuffer(0, quad);
      if (dustBuf) {
        pass.setVertexBuffer(1, dustBuf);
        pass.draw(6, dustCount);
      }
      for (const e of extras) {
        if (e.dustBuf) {
          pass.setVertexBuffer(1, e.dustBuf);
          pass.draw(6, e.dustCount);
        }
      }
      pass.end();
    }
    // --- multi-scale bloom ---
    // 1) bright-pass the scene into pyramid level 0
    {
      const pass = enc.beginRenderPass({
        label: 'galaxy:brightPass',
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
    // 2) downsample chain (progressively wider, softer glow)
    for (let i = 1; i < BLOOM_MIPS; i++) {
      const pass = enc.beginRenderPass({
        label: `galaxy:downPass${i}`,
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
    // 3) upsample chain: additively fold each coarse level back into the finer one
    for (let i = BLOOM_MIPS - 2; i >= 0; i--) {
      const pass = enc.beginRenderPass({
        label: `galaxy:upPass${i}`,
        colorAttachments: [{ view: bloomMips[i]!.createView(), loadOp: 'load', storeOp: 'store' }],
      });
      pass.setPipeline(upPipe);
      pass.setBindGroup(0, upBG[i]!);
      pass.draw(3);
      pass.end();
    }
    // composite -> canvas
    {
      const pass = enc.beginRenderPass({
        label: 'galaxy:compositePass',
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

    // fps
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
    setParams,
    setRender,
    setView,
    setAutoRotate,
    setInsets,
    setExtras,
    step: (now?: number): void => drawFrame(now ?? performance.now()),
    async sample() {
      drawFrame(performance.now());
      const enc = device.createCommandEncoder({ label: 'galaxy:samplePass' });
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: debugTex.createView(),
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
        { texture: debugTex },
        { buffer: dbgBuf, bytesPerRow: 256, rowsPerImage: 64 },
        [64, 64, 1],
      );
      device.queue.submit([enc.finish()]);
      await dbgBuf.mapAsync(GPUMapMode.READ);
      const a = new Uint8Array(dbgBuf.getMappedRange().slice(0));
      dbgBuf.unmap();
      let s = 0;
      let m = 0;
      let nz = 0;
      const n = a.length / 4;
      for (let i = 0; i < a.length; i += 4) {
        const l = (a[i]! + a[i + 1]! + a[i + 2]!) / 3;
        s += l;
        if (l > m) m = l;
        if (l > 4) nz++;
      }
      return {
        mean: +(s / n).toFixed(2),
        max: m,
        litPct: +((100 * nz) / n).toFixed(1),
        stars: starCount,
      };
    },
    getCamera: (): ViewPose => ({ az: cam.az, el: cam.el, dist: cam.dist }),
    async grab(size?: number) {
      const S = size ?? 480;
      drawFrame(performance.now());
      const tex = device.createTexture({
        label: 'galaxy:grabTex',
        size: [S, S],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const bpr = Math.ceil((S * 4) / 256) * 256;
      const buf = device.createBuffer({
        label: 'galaxy:grabBuf',
        size: bpr * S,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const enc = device.createCommandEncoder({ label: 'galaxy:grabPass' });
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
          if (bgra) {
            out[di] = src[si + 2]!;
            out[di + 1] = src[si + 1]!;
            out[di + 2] = src[si]!;
          } else {
            out[di] = src[si]!;
            out[di + 1] = src[si + 1]!;
            out[di + 2] = src[si + 2]!;
          }
          out[di + 3] = 255;
        }
      }
      buf.unmap();
      buf.destroy();
      tex.destroy();
      return { S, data: out };
    },
    dispose(): void {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
