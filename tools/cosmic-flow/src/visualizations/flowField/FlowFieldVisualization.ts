/**
 * FlowFieldVisualization — the core flow layer: advected pathlines and static
 * streamlines, ported to behavioural parity with the spike.
 *
 * ### Two fully independent buffer sets (one per mode)
 *
 * The spike keeps advect and streamline in entirely separate particle fields so
 * switching modes just shows the other field — no cross-contamination, no
 * reseed. We mirror that: `bufs[0]` = advect, `bufs[1]` = streamline, each a
 * { part, trail, acc } triple. Only advect ever reads/writes `acc` (the
 * carried-distance accumulator), so its compute bind group binds it at @5 and
 * the streamline bind group omits it.
 *
 * ### Bind groups come from each PIPELINE's own layout
 *
 * Both pipelines use layout:'auto', and auto-derived bind-group layouts are
 * pipeline-SPECIFIC even when the binding declarations look identical (a known
 * WebGPU trap — see project memory). So each compute bind group is built from
 * THAT mode's pipeline.getBindGroupLayout(0), and the render bind groups from
 * the render pipeline's layout. Sharing one layout across pipelines would throw
 * at draw time.
 *
 * ### Seeding (internal, decision §C)
 *
 * Spawn positions are chosen on the GPU by density-weighted rejection sampling.
 * A mode is seeded once up front: `seedPending` starts true for both, and on the
 * first `encodeCompute` for the active mode we record a dedicated SEED pass
 * (seedFlag=1, n=MAX_PARTICLES) before the per-frame advance, then clear that
 * mode's flag. The spike seeds via a SEPARATE submit; here we record the seed
 * pass into the same frame encoder (passes in one encoder run in order, so the
 * advance sees the seeded buffers). TODO(Phase 8): a store-driven reseed trigger
 * (reset button / density-bias change) will re-arm seedPending[mode].
 *
 * ### Phase (decision §D)
 *
 * The travelling streamline pulse is driven by `this.phase`, advanced each frame
 * by dt * flowSpeed — an internal accumulator, exactly the spike's `flowPhase`.
 */
import type { Visualization } from '../../../@types/visualizations/Visualization';
import type { SliderSpec } from '../../../@types/visualizations/SliderSpec';
import type { EngineContext } from '../../../@types/engine/EngineContext';
import type { FrameContext } from '../../../@types/engine/FrameContext';
import { flowComputeWgsl } from './flow.compute.wgsl';
import { flowRenderWgsl } from './flow.render.wgsl';
import { FLOW_ADVECT_PARAM_SPECS } from './params';
import { TRAIL, DT, MAX_PARTICLES, HEAD_STEP_SCALE } from './constants';

// One independent particle buffer set per mode.
type ModeBufs = {
  readonly part: GPUBuffer; // xyz + age
  readonly trail: GPUBuffer; // ring of (xyz, speed) per particle
  readonly acc: GPUBuffer; // advect carried distance since last ring point
};

const SEED_FLAG_ON = 1;
const SEED_FLAG_OFF = 0;
const WORKGROUP_SIZE = 64;
const ADVECT = 0;
const STREAMLINE = 1;

export class FlowFieldVisualization implements Visualization {
  readonly id = 'flowField';
  readonly label = 'Flow';
  // The advect specs are the superset (they include wander); the control panel
  // filters by the active mode later. Either mode's exposure/contrast feeds the
  // shared tonemap, so both must be present here.
  readonly paramSpecs: readonly SliderSpec[] = FLOW_ADVECT_PARAM_SPECS;

  // GPU resources, populated by init(). Indexed [advect, streamline].
  private device!: GPUDevice;
  private bufs!: readonly [ModeBufs, ModeBufs];
  private compPrm!: GPUBuffer;
  private camBuf!: GPUBuffer;
  private computePipelines!: readonly [GPUComputePipeline, GPUComputePipeline];
  private computeBindGroups!: readonly [GPUBindGroup, GPUBindGroup];
  private renderPipeline!: GPURenderPipeline;
  private renderBindGroups!: readonly [GPUBindGroup, GPUBindGroup];

  // Internal state (decisions §C / §D).
  private seedPending: [boolean, boolean] = [true, true]; // [advect, streamline]
  private phase = 0; // travelling-pulse accumulator (spike flowPhase)

  // Scratch typed arrays reused each frame to avoid per-frame allocation.
  private readonly prmF32 = new Float32Array(12); // compPrm view (48 bytes / 4)
  private readonly prmU32 = new Uint32Array(this.prmF32.buffer);
  private readonly camF32 = new Float32Array(20); // camBuf view (80 bytes / 4)
  private readonly camU32 = new Uint32Array(this.camF32.buffer);

  init(ctx: EngineContext): void {
    const { device } = ctx;
    this.device = device;

    const makeBufs = (): ModeBufs => ({
      part: device.createBuffer({
        size: MAX_PARTICLES * 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      trail: device.createBuffer({
        size: MAX_PARTICLES * TRAIL * 16,
        usage: GPUBufferUsage.STORAGE,
      }),
      acc: device.createBuffer({
        size: MAX_PARTICLES * 4,
        usage: GPUBufferUsage.STORAGE,
      }),
    });
    this.bufs = [makeBufs(), makeBufs()];

    this.compPrm = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.camBuf = device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const computeModule = ctx.createShaderModule(flowComputeWgsl, 'flow.compute');
    const renderModule = ctx.createShaderModule(flowRenderWgsl, 'flow.render');

    // Two compute pipelines off one module — advect (pathlines) vs streamline.
    const advectPipe = device.createComputePipeline({
      layout: 'auto',
      compute: { module: computeModule, entryPoint: 'advect' },
    });
    const streamPipe = device.createComputePipeline({
      layout: 'auto',
      compute: { module: computeModule, entryPoint: 'streamline' },
    });
    this.computePipelines = [advectPipe, streamPipe];

    // Per-mode compute bind groups, each from THAT pipeline's auto layout.
    // advect binds the carried-distance accumulator at @5; streamline omits it.
    this.computeBindGroups = [
      device.createBindGroup({
        layout: advectPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.bufs[ADVECT].part } },
          { binding: 1, resource: ctx.field.textureView },
          { binding: 2, resource: ctx.field.sampler },
          { binding: 3, resource: { buffer: this.compPrm } },
          { binding: 4, resource: { buffer: this.bufs[ADVECT].trail } },
          { binding: 5, resource: { buffer: this.bufs[ADVECT].acc } },
        ],
      }),
      device.createBindGroup({
        layout: streamPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.bufs[STREAMLINE].part } },
          { binding: 1, resource: ctx.field.textureView },
          { binding: 2, resource: ctx.field.sampler },
          { binding: 3, resource: { buffer: this.compPrm } },
          { binding: 4, resource: { buffer: this.bufs[STREAMLINE].trail } },
        ],
      }),
    ];

    // Ribbon render pipeline — additive (one/one) into the shared HDR target,
    // for BOTH colour and alpha so the tonemap treats trails like any emission.
    this.renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: renderModule, entryPoint: 'vsTrail' },
      fragment: {
        module: renderModule,
        entryPoint: 'fsTrail',
        targets: [
          {
            format: ctx.hdrFormat,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-strip' },
    });

    // Per-mode render bind groups: each reads its OWN trail + parts buffers.
    const renderLayout = this.renderPipeline.getBindGroupLayout(0);
    this.renderBindGroups = [
      device.createBindGroup({
        layout: renderLayout,
        entries: [
          { binding: 0, resource: { buffer: this.camBuf } },
          { binding: 1, resource: { buffer: this.bufs[ADVECT].trail } },
          { binding: 2, resource: { buffer: this.bufs[ADVECT].part } },
        ],
      }),
      device.createBindGroup({
        layout: renderLayout,
        entries: [
          { binding: 0, resource: { buffer: this.camBuf } },
          { binding: 1, resource: { buffer: this.bufs[STREAMLINE].trail } },
          { binding: 2, resource: { buffer: this.bufs[STREAMLINE].part } },
        ],
      }),
    ];
  }

  encodeCompute(encoder: GPUCommandEncoder, frame: FrameContext): void {
    // Destructure with `= 0` defaults: params is a Record<string, number> (so
    // each read is `number | undefined`), but selectFrameParams always supplies
    // these keys — the defaults just narrow the type to a plain number.
    const { count = 0, trail = 0, flowSpeed = 0, densityBias = 0, wander = 0, modeIndex: mi = 0 } =
      frame.params;
    const modeIndex = mi === ADVECT ? ADVECT : STREAMLINE;

    // Seed the active mode once, before its first per-frame advance. We record
    // the seed pass into THIS encoder (ordered before the advance pass below),
    // rather than the spike's separate submit — same effect, one fewer submit.
    if (this.seedPending[modeIndex]) {
      this.writeCompPrm({
        trailStep: trail,
        headStep: 0,
        n: MAX_PARTICLES,
        frame: frame.frame,
        mode: modeIndex,
        seedFlag: SEED_FLAG_ON,
        bias: densityBias,
        wander: 0,
      });
      const seedPass = encoder.beginComputePass();
      seedPass.setPipeline(this.computePipelines[modeIndex]);
      seedPass.setBindGroup(0, this.computeBindGroups[modeIndex]);
      seedPass.dispatchWorkgroups(Math.ceil(MAX_PARTICLES / WORKGROUP_SIZE));
      seedPass.end();
      this.seedPending[modeIndex] = false;
    }

    const n = Math.round(count);
    this.writeCompPrm({
      trailStep: trail,
      // advect: flowSpeed -> continuous head distance per frame (independent of
      // trail length, which only sets ring spacing). streamline ignores headStep.
      headStep: flowSpeed * HEAD_STEP_SCALE,
      n,
      frame: frame.frame,
      mode: modeIndex,
      seedFlag: SEED_FLAG_OFF,
      bias: densityBias,
      wander: modeIndex === ADVECT ? wander : 0,
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.computePipelines[modeIndex]);
    pass.setBindGroup(0, this.computeBindGroups[modeIndex]);
    pass.dispatchWorkgroups(Math.ceil(n / WORKGROUP_SIZE));
    pass.end();
  }

  encode(pass: GPURenderPassEncoder, frame: FrameContext): void {
    const { count = 0, flowSpeed = 0, size = 0, modeIndex: mi = 0 } = frame.params;
    const modeIndex = mi === ADVECT ? ADVECT : STREAMLINE;

    // Advance the travelling-pulse phase (streamline mode); harmless in advect.
    this.phase += frame.dt * flowSpeed;

    // camBuf: mvp @0 (16 floats), width @64, aspect @68, phase @72, mode @76.
    this.camF32.set(frame.viewProj, 0);
    this.camF32[16] = size; // width
    this.camF32[17] = frame.size[0]! / frame.size[1]!; // aspect
    this.camF32[18] = this.phase;
    this.camU32[19] = modeIndex;
    this.device.queue.writeBuffer(this.camBuf, 0, this.camF32);

    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBindGroups[modeIndex]);
    pass.draw(2 * TRAIL, Math.round(count));
  }

  dispose(): void {
    for (const b of this.bufs) {
      b.part.destroy();
      b.trail.destroy();
      b.acc.destroy();
    }
    this.compPrm.destroy();
    this.camBuf.destroy();
  }

  // Pack the compute uniform per its byte layout and upload it.
  //   dt f32@0, trailStep f32@4, headStep f32@8, n u32@12, frame u32@16,
  //   mode u32@20, seedFlag u32@24, bias f32@28, wander f32@32.
  private writeCompPrm(args: {
    trailStep: number;
    headStep: number;
    n: number;
    frame: number;
    mode: number;
    seedFlag: number;
    bias: number;
    wander: number;
  }): void {
    this.prmF32[0] = DT;
    this.prmF32[1] = args.trailStep;
    this.prmF32[2] = args.headStep;
    this.prmU32[3] = args.n;
    this.prmU32[4] = args.frame;
    this.prmU32[5] = args.mode;
    this.prmU32[6] = args.seedFlag;
    this.prmF32[7] = args.bias;
    this.prmF32[8] = args.wander;
    this.device.queue.writeBuffer(this.compPrm, 0, this.prmF32);
  }
}
