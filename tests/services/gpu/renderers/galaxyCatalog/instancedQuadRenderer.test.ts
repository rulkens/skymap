/**
 * instancedQuadRenderer factory tests.
 *
 * Focuses on the structural choices the factory makes from its config
 * (bind-group-layout shape, capacity strategy, destroy invariants)
 * rather than on draw-time correctness — full pixel verification
 * requires a real WebGPU device and lives in the manual visual
 * smoke-test pass at PR review time.
 *
 * Mock pattern follows galaxyPickRenderer.test.ts: a stub `GPUDevice` whose
 * methods are `vi.fn()` spies, intercepted at construction time so we
 * can assert on the descriptors the factory passed in.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createInstancedQuadRenderer,
  BYTES_PER_INSTANCE,
  FLOATS_PER_INSTANCE,
  UNIFORM_BYTES,
} from '../../../../../src/services/gpu/renderers/galaxyCatalog/instancedQuadRenderer';
import type { GpuContext } from '../../../../../src/@types/rendering/GpuContext';
import type { FocusUniformsBgl } from '../../../../../src/@types/rendering/FocusUniformsBgl';

// Stub focus BGL — the factory only forwards it into the pipeline layout;
// the mock device returns {} for it, so a branded empty object suffices.
const FOCUS_BGL = {} as unknown as FocusUniformsBgl;
// Stub shared focus bind group passed into draw(). The factory only binds
// it (setBindGroup) — never introspected — so {} is enough.
const FOCUS_BIND_GROUP = {} as unknown as GPUBindGroup;

/**
 * Fluent stub-device builder. Each method captures its calls into
 * the returned `calls` record so individual tests can introspect
 * what the factory asked the device to do.
 */
function makeStubContext() {
  const calls = {
    createBindGroupLayout: [] as GPUBindGroupLayoutDescriptor[],
    createBuffer: [] as GPUBufferDescriptor[],
    createBindGroup: [] as GPUBindGroupDescriptor[],
    createRenderPipeline: [] as GPURenderPipelineDescriptor[],
    bufferDestroyed: [] as number[], // indexes into calls.createBuffer
  };

  let bufferIndex = 0;
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      calls.createRenderPipeline.push(desc);
      return { getBindGroupLayout: () => ({}) };
    }),
    createPipelineLayout: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn((desc: GPUBindGroupLayoutDescriptor) => {
      calls.createBindGroupLayout.push(desc);
      return {};
    }),
    createBuffer: vi.fn((desc: GPUBufferDescriptor) => {
      const idx = bufferIndex++;
      calls.createBuffer.push(desc);
      return {
        __index: idx,
        destroy: vi.fn(() => {
          calls.bufferDestroyed.push(idx);
        }),
      };
    }),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      calls.createBindGroup.push(desc);
      return {};
    }),
    createSampler: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn(), submit: vi.fn() },
  } as unknown as GPUDevice;

  const ctx: GpuContext = {
    device,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float',
    canvas: null as unknown as HTMLCanvasElement,
    hdrCapable: false,
  };

  return { ctx, calls };
}

describe('createInstancedQuadRenderer', () => {
  describe('bind-group layout shape', () => {
    it('builds a 3-binding BGL when atlas is configured', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: {},
        capacity: { kind: 'fixed', max: 256 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });

      // Exactly one BGL created — the factory builds it explicitly
      // (NOT via `layout: 'auto'`, per the WebGPU layout-auto trap).
      expect(calls.createBindGroupLayout).toHaveLength(1);
      const bgl = calls.createBindGroupLayout[0]!;
      const entries = bgl.entries as ReadonlyArray<GPUBindGroupLayoutEntry>;
      expect(entries).toHaveLength(3);
      expect(entries[0]!.binding).toBe(0);
      expect(entries[1]!.binding).toBe(1);
      expect(entries[2]!.binding).toBe(2);
      // Texture + sampler bindings are FRAGMENT-only — the vertex stage
      // never samples.
      expect(entries[1]!.visibility).toBe(GPUShaderStage.FRAGMENT);
      expect(entries[2]!.visibility).toBe(GPUShaderStage.FRAGMENT);
    });

    it('bakes config.targetFormat into the pipeline colour target', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      expect(calls.createRenderPipeline).toHaveLength(1);
      const target = Array.from(calls.createRenderPipeline[0]!.fragment!.targets!)[0]!;
      expect(target!.format).toBe('rgba16float');
    });

    it('builds a 1-binding BGL when atlas is omitted', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });

      expect(calls.createBindGroupLayout).toHaveLength(1);
      const entries = calls.createBindGroupLayout[0]!
        .entries as ReadonlyArray<GPUBindGroupLayoutEntry>;
      expect(entries).toHaveLength(1);
      expect(entries[0]!.binding).toBe(0);
    });

    it('honours uniformVisibility config when overridden', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
        // ProceduralDiskRenderer's BGL pre-Spec-G — preserve the
        // VERTEX|FRAGMENT visibility on binding 0 even though only
        // the vertex stage actually reads the uniform.
        uniformVisibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      });

      const entries = calls.createBindGroupLayout[0]!
        .entries as ReadonlyArray<GPUBindGroupLayoutEntry>;
      expect(entries[0]!.visibility).toBe(GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT);
    });

    it('defaults uniformVisibility to VERTEX when not specified', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: {},
        capacity: { kind: 'fixed', max: 16 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });

      const entries = calls.createBindGroupLayout[0]!
        .entries as ReadonlyArray<GPUBindGroupLayoutEntry>;
      expect(entries[0]!.visibility).toBe(GPUShaderStage.VERTEX);
    });
  });

  describe('atlas binding', () => {
    it('exposes bindAtlas only when atlas is configured', () => {
      const { ctx } = makeStubContext();
      const withAtlas = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: {},
        capacity: { kind: 'fixed', max: 16 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      expect(typeof withAtlas.bindAtlas).toBe('function');

      const { ctx: ctx2 } = makeStubContext();
      const noAtlas = createInstancedQuadRenderer(ctx2.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      expect(noAtlas.bindAtlas).toBeUndefined();
    });

    it('prebuilds the bind group at construction when no atlas (no late binding)', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      // Bind group built immediately, not waiting for a `bindAtlas`
      // call (there is no atlas to bind).
      expect(calls.createBindGroup).toHaveLength(1);
    });

    it('defers bind-group creation until bindAtlas is called when atlas is configured', () => {
      const { ctx, calls } = makeStubContext();
      const r = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: {},
        capacity: { kind: 'fixed', max: 16 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      expect(calls.createBindGroup).toHaveLength(0);

      const fakeView = {} as GPUTextureView;
      r.bindAtlas!(fakeView);
      expect(calls.createBindGroup).toHaveLength(1);
      const desc = calls.createBindGroup[0]!;
      const entries = desc.entries as ReadonlyArray<GPUBindGroupEntry>;
      expect(entries).toHaveLength(3);
      expect(entries[1]!.resource).toBe(fakeView);
    });
  });

  describe('hi-res array binding (texturedDisk consumer)', () => {
    // When `atlas.hiResArray === true` the BGL exposes an optional
    // `texture_2d_array` + sampler pair at bindings 3 + 4. Consumers
    // that don't sample the array (texturedQuad, proceduralDisk) keep
    // their 1- and 3-entry BGL shapes unchanged.

    it('extends the BGL from 3 → 5 entries when atlas.hiResArray is true', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: { hiResArray: true },
        capacity: { kind: 'fixed', max: 256 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });

      expect(calls.createBindGroupLayout).toHaveLength(1);
      const entries = calls.createBindGroupLayout[0]!
        .entries as ReadonlyArray<GPUBindGroupLayoutEntry>;
      expect(entries).toHaveLength(5);
      expect(entries[3]!.binding).toBe(3);
      expect(entries[4]!.binding).toBe(4);
      // Hi-res array texture: FRAGMENT-only, float sample type,
      // '2d-array' view dimension. The viewDimension literal is what
      // makes WGSL's `texture_2d_array<f32>` resolve at pipeline-link time.
      expect(entries[3]!.visibility).toBe(GPUShaderStage.FRAGMENT);
      expect(entries[3]!.texture).toBeDefined();
      expect(entries[3]!.texture!.sampleType).toBe('float');
      expect(entries[3]!.texture!.viewDimension).toBe('2d-array');
      // Binding 4 is the linear sampler for the hi-res array.
      expect(entries[4]!.visibility).toBe(GPUShaderStage.FRAGMENT);
      expect(entries[4]!.sampler).toBeDefined();
      expect(entries[4]!.sampler!.type).toBe('filtering');
    });

    it('keeps the BGL at 3 entries when atlas is configured without hiResArray', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: {},
        capacity: { kind: 'fixed', max: 256 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      const entries = calls.createBindGroupLayout[0]!
        .entries as ReadonlyArray<GPUBindGroupLayoutEntry>;
      expect(entries).toHaveLength(3);
    });

    it('exposes bindHiResArray only when atlas.hiResArray is true', () => {
      const { ctx } = makeStubContext();
      const withHiRes = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: { hiResArray: true },
        capacity: { kind: 'fixed', max: 16 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      expect(typeof withHiRes.bindHiResArray).toBe('function');

      const { ctx: ctx2 } = makeStubContext();
      const atlasOnly = createInstancedQuadRenderer(ctx2.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: {},
        capacity: { kind: 'fixed', max: 16 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      expect(atlasOnly.bindHiResArray).toBeUndefined();

      const { ctx: ctx3 } = makeStubContext();
      const noAtlas = createInstancedQuadRenderer(ctx3.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      expect(noAtlas.bindHiResArray).toBeUndefined();
    });

    it('defers bind-group composition until both bindAtlas + bindHiResArray are called', () => {
      const { ctx, calls } = makeStubContext();
      const r = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: { hiResArray: true },
        capacity: { kind: 'fixed', max: 16 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      expect(calls.createBindGroup).toHaveLength(0);

      // bindAtlas alone is insufficient — all 5 resources are required
      // before composing against a 5-entry BGL.
      const fakeAtlasView = {} as GPUTextureView;
      r.bindAtlas!(fakeAtlasView);
      expect(calls.createBindGroup).toHaveLength(0);

      const fakeArrayView = {} as GPUTextureView;
      r.bindHiResArray!(fakeArrayView);
      // Both halves present — bind group composes.
      expect(calls.createBindGroup).toHaveLength(1);
      const desc = calls.createBindGroup[0]!;
      const entries = desc.entries as ReadonlyArray<GPUBindGroupEntry>;
      expect(entries).toHaveLength(5);
      expect(entries[1]!.resource).toBe(fakeAtlasView);
      expect(entries[3]!.resource).toBe(fakeArrayView);
    });
  });

  describe('capacity strategies', () => {
    it('preallocates the instance buffer at construction with kind:fixed', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: {},
        capacity: { kind: 'fixed', max: 100 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });

      // Two buffers: uniform (96 bytes) + instance (100 * 48 bytes).
      expect(calls.createBuffer).toHaveLength(2);
      const uniformBuf = calls.createBuffer[0]!;
      expect(uniformBuf.size).toBe(UNIFORM_BYTES);
      const instanceBuf = calls.createBuffer[1]!;
      expect(instanceBuf.size).toBe(100 * BYTES_PER_INSTANCE);
    });

    it('does NOT allocate the instance buffer at construction with kind:grow', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      // Only the uniform buffer up front.
      expect(calls.createBuffer).toHaveLength(1);
      expect(calls.createBuffer[0]!.size).toBe(UNIFORM_BYTES);
    });

    it('lazy-allocates the instance buffer on first non-empty draw with kind:grow', () => {
      const { ctx, calls } = makeStubContext();
      const r = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });

      // Stub render-pass — only the methods draw() actually calls.
      const pass = {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        setVertexBuffer: vi.fn(),
        draw: vi.fn(),
      } as unknown as GPURenderPassEncoder;

      const viewProj = new Float32Array(16);
      const instanceBytes = new Float32Array(10 * FLOATS_PER_INSTANCE);
      r.draw({
        focusBindGroup: FOCUS_BIND_GROUP,
        pass,
        viewProj,
        viewport: [800, 600],
        instanceBytes,
        instanceCount: 10,
      });

      // Now we have a second buffer (the instance buffer) at min
      // capacity 64 (the floor in the grow strategy).
      expect(calls.createBuffer).toHaveLength(2);
      expect(calls.createBuffer[1]!.size).toBe(64 * BYTES_PER_INSTANCE);
    });

    it('regrows the instance buffer when subsequent draws exceed capacity', () => {
      const { ctx, calls } = makeStubContext();
      const r = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });

      const pass = {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        setVertexBuffer: vi.fn(),
        draw: vi.fn(),
      } as unknown as GPURenderPassEncoder;

      const viewProj = new Float32Array(16);

      // First draw: 10 instances → buffer sized at 64 (the floor).
      r.draw({
        focusBindGroup: FOCUS_BIND_GROUP,
        pass,
        viewProj,
        viewport: [800, 600],
        instanceBytes: new Float32Array(10 * FLOATS_PER_INSTANCE),
        instanceCount: 10,
      });
      expect(calls.createBuffer).toHaveLength(2);
      expect(calls.createBuffer[1]!.size).toBe(64 * BYTES_PER_INSTANCE);

      // Second draw within capacity: no realloc.
      r.draw({
        focusBindGroup: FOCUS_BIND_GROUP,
        pass,
        viewProj,
        viewport: [800, 600],
        instanceBytes: new Float32Array(50 * FLOATS_PER_INSTANCE),
        instanceCount: 50,
      });
      expect(calls.createBuffer).toHaveLength(2);

      // Third draw exceeds capacity: old buffer destroyed, new one
      // allocated at the requested size.
      r.draw({
        focusBindGroup: FOCUS_BIND_GROUP,
        pass,
        viewProj,
        viewport: [800, 600],
        instanceBytes: new Float32Array(200 * FLOATS_PER_INSTANCE),
        instanceCount: 200,
      });
      expect(calls.createBuffer).toHaveLength(3);
      expect(calls.createBuffer[2]!.size).toBe(200 * BYTES_PER_INSTANCE);
      // The previous instance buffer (index 1) was destroyed.
      expect(calls.bufferDestroyed).toContain(1);
    });

    it('skips draw entirely on instanceCount === 0', () => {
      const { ctx, calls } = makeStubContext();
      const r = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      const drawSpy = vi.fn();
      const pass = {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        setVertexBuffer: vi.fn(),
        draw: drawSpy,
      } as unknown as GPURenderPassEncoder;

      r.draw({
        focusBindGroup: FOCUS_BIND_GROUP,
        pass,
        viewProj: new Float32Array(16),
        viewport: [100, 100],
        instanceBytes: new Float32Array(0),
        instanceCount: 0,
      });

      expect(drawSpy).not.toHaveBeenCalled();
      // Still no instance buffer allocated.
      expect(calls.createBuffer).toHaveLength(1);
    });

    it('skips draw silently when atlas-capable renderer has no atlas bound yet', () => {
      const { ctx, calls } = makeStubContext();
      const r = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: {},
        capacity: { kind: 'fixed', max: 16 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      const drawSpy = vi.fn();
      const pass = {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        setVertexBuffer: vi.fn(),
        draw: drawSpy,
      } as unknown as GPURenderPassEncoder;

      // No bindAtlas() call — bind group is undefined.
      r.draw({
        focusBindGroup: FOCUS_BIND_GROUP,
        pass,
        viewProj: new Float32Array(16),
        viewport: [100, 100],
        instanceBytes: new Float32Array(5 * FLOATS_PER_INSTANCE),
        instanceCount: 5,
      });

      expect(drawSpy).not.toHaveBeenCalled();
      // No bind group ever built.
      expect(calls.createBindGroup).toHaveLength(0);
    });
  });

  describe('destroy', () => {
    it('destroys uniform + instance buffers under fixed capacity', () => {
      const { ctx, calls } = makeStubContext();
      const r = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: {},
        capacity: { kind: 'fixed', max: 16 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      r.destroy();
      // Uniform (index 0) + instance (index 1).
      expect(calls.bufferDestroyed.sort()).toEqual([0, 1]);
    });

    it('destroys only the uniform buffer under grow when no draw has happened', () => {
      const { ctx, calls } = makeStubContext();
      const r = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      r.destroy();
      // Only the uniform buffer (index 0) ever existed.
      expect(calls.bufferDestroyed).toEqual([0]);
    });

    it('destroys uniform + lazily-allocated instance buffer under grow after a draw', () => {
      const { ctx, calls } = makeStubContext();
      const r = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      const pass = {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        setVertexBuffer: vi.fn(),
        draw: vi.fn(),
      } as unknown as GPURenderPassEncoder;
      r.draw({
        focusBindGroup: FOCUS_BIND_GROUP,
        pass,
        viewProj: new Float32Array(16),
        viewport: [100, 100],
        instanceBytes: new Float32Array(5 * FLOATS_PER_INSTANCE),
        instanceCount: 5,
      });
      r.destroy();
      expect(calls.bufferDestroyed.sort()).toEqual([0, 1]);
    });
  });

  describe('viewSlotCount (Task 13b)', () => {
    it('defaults to a single @group(0) buffer+bindGroup — createBuffer count unchanged for existing consumers', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        atlas: {},
        capacity: { kind: 'fixed', max: 16 },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      // Uniform (1) + instance (1) = 2 — same count as before this option
      // existed, since `viewSlotCount` defaults to 1.
      expect(calls.createBuffer).toHaveLength(2);
      expect(calls.createBindGroup).toHaveLength(0); // atlas-capable: deferred
    });

    it('allocates one @group(0) buffer per slot when viewSlotCount > 1', () => {
      const { ctx, calls } = makeStubContext();
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
        viewSlotCount: 3,
      });
      // No atlas: 3 uniform buffers, eagerly bound bind groups, no instance
      // buffer yet (grow strategy).
      expect(calls.createBuffer).toHaveLength(3);
      for (const desc of calls.createBuffer) {
        expect(desc.size).toBe(UNIFORM_BYTES);
      }
      expect(calls.createBindGroup).toHaveLength(3);
    });

    it('two draw() calls with different viewSlot write into DIFFERENT physical buffers — the writeBuffer/submit race this closes', () => {
      const { ctx, calls } = makeStubContext();
      const writeBufferSpy = (
        ctx.device as unknown as { queue: { writeBuffer: ReturnType<typeof vi.fn> } }
      ).queue.writeBuffer;
      const r = createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
        viewSlotCount: 3,
      });

      const bindGroupsSeen: unknown[] = [];
      const pass = {
        setPipeline: vi.fn(),
        setBindGroup: (slot: number, bg: unknown) => {
          if (slot === 0) bindGroupsSeen.push(bg);
        },
        setVertexBuffer: vi.fn(),
        draw: vi.fn(),
      } as unknown as GPURenderPassEncoder;

      // A sky-cubemap capture sweep: two `draw()` calls (different faces) in
      // the same frame, both before one `submit()`.
      r.draw({
        focusBindGroup: FOCUS_BIND_GROUP,
        pass,
        viewProj: new Float32Array(16),
        viewport: [512, 512],
        instanceBytes: new Float32Array(FLOATS_PER_INSTANCE),
        instanceCount: 1,
        viewSlot: 1,
      });
      r.draw({
        focusBindGroup: FOCUS_BIND_GROUP,
        pass,
        viewProj: new Float32Array(16),
        viewport: [512, 512],
        instanceBytes: new Float32Array(FLOATS_PER_INSTANCE),
        instanceCount: 1,
        viewSlot: 2,
      });

      // The @group(0) bind group resolves to a DIFFERENT physical bind group
      // (over a different uniform buffer) per view slot.
      expect(bindGroupsSeen[0]).not.toBe(bindGroupsSeen[1]);

      // The uniform writeBuffer calls target different underlying buffers —
      // slot 2's write can never land in slot 1's buffer. Identify the
      // uniform-sized writes by their DATA byte length (24 floats), not
      // buffer identity, since the mock's returned buffers carry a `size`
      // only on the createBuffer call args, not on the object itself.
      const uniformWriteTargets = writeBufferSpy.mock.calls
        .filter((call) => (call[2] as Float32Array).length === UNIFORM_BYTES / 4)
        .map((call) => (call[0] as { __index: number }).__index);
      expect(uniformWriteTargets).toEqual([1, 2]); // slot 1's buffer, then slot 2's
    });
  });

  describe('blend mode', () => {
    it('applies additive blend factors when blend = "additive"', () => {
      const { ctx } = makeStubContext();
      const createPipelineSpy = (
        ctx.device as unknown as { createRenderPipeline: ReturnType<typeof vi.fn> }
      ).createRenderPipeline;
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'additive',
        targetFormat: 'rgba16float',
      });
      const desc = createPipelineSpy.mock.calls[0]![0] as GPURenderPipelineDescriptor;
      const target = desc.fragment!.targets[0]!;
      // Both color + alpha use {one, one, add}.
      expect(target!.blend!.color.srcFactor).toBe('one');
      expect(target!.blend!.color.dstFactor).toBe('one');
    });

    it('applies premultiplied-OVER blend factors when blend = "alpha"', () => {
      const { ctx } = makeStubContext();
      const createPipelineSpy = (
        ctx.device as unknown as { createRenderPipeline: ReturnType<typeof vi.fn> }
      ).createRenderPipeline;
      createInstancedQuadRenderer(ctx.device, {
        focusBgl: FOCUS_BGL,
        label: 'test',
        vertexSource: '@vertex fn vs() {}',
        fragmentSource: '@fragment fn fs() {}',
        capacity: { kind: 'grow' },
        blend: 'alpha',
        targetFormat: 'rgba16float',
      });
      const desc = createPipelineSpy.mock.calls[0]![0] as GPURenderPipelineDescriptor;
      const target = desc.fragment!.targets[0]!;
      expect(target!.blend!.color.srcFactor).toBe('src-alpha');
      expect(target!.blend!.color.dstFactor).toBe('one-minus-src-alpha');
    });
  });
});
