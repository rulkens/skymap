import { describe, it, expect, vi } from 'vitest';
import { createStructureMarkerRenderer } from '../../../../../src/services/gpu/renderers/structureMarker/structureMarkerRenderer';
import type { StructureMarkerDescriptor } from '../../../../../src/@types/rendering/StructureMarkerDescriptor';
import type { FadeUniformsBgl } from '../../../../../src/@types/rendering/FadeUniformsBgl';
import { CAMERA_UNIFORM_BYTES } from '../../../../../src/services/gpu/lib/cameraUniforms';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import { STRUCTURE_IDS } from '../../../../../src/data/structure/structureIds';
import { rebaseViewProj } from '../../../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../src/utils/math/narrowMat4';

// Null-device pattern, mirrors markerLineRenderer.test.ts.
const newRenderer = (initialCapacity?: number) => {
  const ctx = {
    device: null as unknown as GPUDevice,
    context: null as unknown as GPUCanvasContext,
    format: 'rgba16float' as GPUTextureFormat,
    canvas: null as unknown as HTMLCanvasElement,
    hdrCapable: false,
  };
  return createStructureMarkerRenderer(
    ctx,
    'rgba16float',
    null as unknown as FadeUniformsBgl,
    false,
    'depth24plus',
    false,
    STRUCTURE_IDS,
    initialCapacity,
  );
};

const cluster = (id: number): StructureMarkerDescriptor => ({
  // `id` is CPU-side metadata used by the selection / pick paths;
  // the renderer ignores it when packing the instance buffer, but
  // the type requires it.  Synthesize a stable per-fixture id.
  id: `test-cluster-${id}`,
  category: 'galaxy-cluster',
  worldPos: [id, 0, 0],
  radiusMpc: 2,
  haloColor: [1, 0.85, 0.4, 1],
  ringColor: [1, 0.85, 0.4, 1],
  pickable: true,
});

// `void` is a JS reserved word; use void_ to avoid a syntax error.
const void_ = (id: number): StructureMarkerDescriptor => ({
  id: `test-void-${id}`,
  category: 'void',
  worldPos: [id, 0, 0],
  radiusMpc: 5,
  haloColor: [0, 0, 0, 0], // haloAlpha = 0 per spec — no halo for voids
  ringColor: [0, 0.9, 0.9, 1],
  pickable: true,
});

const group = (id: number): StructureMarkerDescriptor => ({
  id: `test-group-${id}`,
  category: 'galaxy-group',
  worldPos: [id, 0, 0],
  radiusMpc: 1,
  haloColor: [0.5, 0.9, 0.6, 0.8], // soft green — colour irrelevant for CPU bucketing
  ringColor: [0.5, 0.9, 0.6, 1],
  pickable: true,
});

describe('StructureMarkerRenderer (CPU state)', () => {
  it('replaces (not appends) on subsequent setMarkers', () => {
    const r = newRenderer();
    r.setMarkers([cluster(1)], [0, 0, 0]);
    r.setMarkers([cluster(2), cluster(3)], [0, 0, 0]);
    expect(r.markerCount()).toBe(2);
  });

  it('grows past the initial capacity instead of truncating', () => {
    // Regression: the buffer must grow to hold the full set — a fixed cap
    // drops descriptors in insertion order (clusters saturate the buffer
    // and superclusters/voids never pack).
    const r = newRenderer(2);
    r.setMarkers([cluster(1), cluster(2), cluster(3), cluster(4), cluster(5)], [0, 0, 0]);
    expect(r.markerCount()).toBe(5);
  });

  it('counts group descriptors alongside cluster / void', () => {
    // Regression guard: group descriptors must NOT be skipped by the
    // write-pass guard.  Feed a mix of all four marker-bearing categories
    // and assert every descriptor is counted.
    const r = newRenderer();
    r.setMarkers([cluster(1), void_(2), group(3), group(4)], [0, 0, 0]);
    expect(r.markerCount()).toBe(4);
  });

  it('group descriptors do not affect cluster or void counts', () => {
    // Buckets are independent: adding group markers must not bleed into
    // the cluster or void buckets (which would desync pick indices).
    const r = newRenderer();
    r.setMarkers([cluster(1), cluster(2), void_(3), group(4), group(5), group(6)], [0, 0, 0]);
    // Total = 6; if any bucket bleed occurred markerCount would be wrong.
    expect(r.markerCount()).toBe(6);
  });
});

describe('StructureMarkerRenderer categories', () => {
  it('a renderer ignores descriptors outside its categories', () => {
    const r = createStructureMarkerRenderer(
      {
        device: null as unknown as GPUDevice,
        context: null as unknown as GPUCanvasContext,
        format: 'rgba16float' as GPUTextureFormat,
        canvas: null as unknown as HTMLCanvasElement,
        hdrCapable: false,
      },
      'rgba16float',
      null as unknown as FadeUniformsBgl,
      false,
      'depth24plus',
      false,
      ['void'],
    );
    r.setMarkers([cluster(1), void_(2), group(3), void_(4)], [0, 0, 0]);
    expect(r.markerCount()).toBe(2);
  });
});

describe('StructureMarkerRenderer colour target', () => {
  it('bakes the given targetFormat into the halo + ring pipelines (pick stays r32uint)', () => {
    const captured: GPURenderPipelineDescriptor[] = [];
    const device = {
      createBindGroupLayout: vi.fn(() => ({})),
      createPipelineLayout: vi.fn(() => ({})),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
        captured.push(desc);
        return { getBindGroupLayout: () => ({}) };
      }),
      createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
      createBindGroup: vi.fn(() => ({})),
      queue: { writeBuffer: vi.fn() },
    } as unknown as GPUDevice;
    const ctx = {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'bgra8unorm' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };
    createStructureMarkerRenderer(
      ctx,
      'rgba16float',
      {} as unknown as FadeUniformsBgl,
      false,
      'depth24plus',
      false,
      STRUCTURE_IDS,
    );

    const formatByLabel = new Map(
      captured.map((p) => [p.label, Array.from(p.fragment!.targets!)[0]!.format]),
    );
    // Halo + ring write into the HDR target; the pick pipeline is the integer
    // r32uint texture and must NOT pick up the colour target format.
    expect(formatByLabel.get('structure-marker-halo-pipeline')).toBe('rgba16float');
    expect(formatByLabel.get('structure-marker-ring-pipeline')).toBe('rgba16float');
    expect(formatByLabel.get('structure-marker-ring-pick-pipeline')).toBe('r32uint');
  });

  it("builds the pick pipeline with its slab's pick depth format", () => {
    // The NEAR0 pick pass carries depth32float; a pipeline built with the
    // COSMO format invalidates the whole pick encoder on the first pick.
    const captured: GPURenderPipelineDescriptor[] = [];
    const device = {
      createBindGroupLayout: vi.fn(() => ({})),
      createPipelineLayout: vi.fn(() => ({})),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
        captured.push(desc);
        return { getBindGroupLayout: () => ({}) };
      }),
      createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
      createBindGroup: vi.fn(() => ({})),
      queue: { writeBuffer: vi.fn() },
    } as unknown as GPUDevice;
    createStructureMarkerRenderer(
      {
        device,
        context: null as unknown as GPUCanvasContext,
        format: 'bgra8unorm' as GPUTextureFormat,
        canvas: null as unknown as HTMLCanvasElement,
        hdrCapable: false,
      },
      'rgba16float',
      {} as unknown as FadeUniformsBgl,
      true,
      'depth32float',
      true,
      STRUCTURE_IDS,
    );
    const pick = captured.find((p) => p.label === 'structure-marker-ring-pick-pipeline');
    expect(pick?.depthStencil?.format).toBe('depth32float');
  });

  it('only the star-band instance picks through the banded fragment entry point', () => {
    const pickEntry = (pickInStarBand: boolean): string | undefined => {
      const captured: GPURenderPipelineDescriptor[] = [];
      const device = {
        createBindGroupLayout: vi.fn(() => ({})),
        createPipelineLayout: vi.fn(() => ({})),
        createShaderModule: vi.fn(() => ({
          getCompilationInfo: () => Promise.resolve({ messages: [] }),
        })),
        createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
          captured.push(desc);
          return { getBindGroupLayout: () => ({}) };
        }),
        createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
        createBindGroup: vi.fn(() => ({})),
        queue: { writeBuffer: vi.fn() },
      } as unknown as GPUDevice;
      createStructureMarkerRenderer(
        {
          device,
          context: null as unknown as GPUCanvasContext,
          format: 'bgra8unorm' as GPUTextureFormat,
          canvas: null as unknown as HTMLCanvasElement,
          hdrCapable: false,
        },
        'rgba16float',
        {} as unknown as FadeUniformsBgl,
        true,
        'depth32float',
        pickInStarBand,
        STRUCTURE_IDS,
      );
      return captured.find((p) => p.label === 'structure-marker-ring-pick-pipeline')?.fragment
        ?.entryPoint;
    };
    expect(pickEntry(true)).toBe('fsRingPickBanded');
    expect(pickEntry(false)).toBe('fsRingPick');
  });
});

describe('StructureMarkerRenderer pick camera', () => {
  it("pickRing uploads the caller's pick camera to its own buffer and binds it at slot 0", () => {
    const buffersByLabel = new Map<string, GPUBuffer>();
    const bufferSizesByLabel = new Map<string, number>();
    const bindGroupsByLabel = new Map<string, GPUBindGroup>();
    const device = {
      createBindGroupLayout: vi.fn(() => ({})),
      createPipelineLayout: vi.fn(() => ({})),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
      createBuffer: vi.fn((desc: GPUBufferDescriptor) => {
        const buf = { label: desc.label, destroy: vi.fn() } as unknown as GPUBuffer;
        buffersByLabel.set(desc.label!, buf);
        bufferSizesByLabel.set(desc.label!, desc.size);
        return buf;
      }),
      createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
        const bg = { label: desc.label } as unknown as GPUBindGroup;
        bindGroupsByLabel.set(desc.label!, bg);
        return bg;
      }),
      queue: { writeBuffer: vi.fn() },
    } as unknown as GPUDevice;
    const ctx = {
      device,
      context: null as unknown as GPUCanvasContext,
      format: 'bgra8unorm' as GPUTextureFormat,
      canvas: null as unknown as HTMLCanvasElement,
      hdrCapable: false,
    };
    const renderer = createStructureMarkerRenderer(
      ctx,
      'rgba16float',
      {} as unknown as FadeUniformsBgl,
      false,
      'depth24plus',
      false,
      STRUCTURE_IDS,
    );
    renderer.setMarkers([cluster(1)], [0, 0, 0]);
    (device.queue.writeBuffer as ReturnType<typeof vi.fn>).mockClear();

    const viewProj = Float64Array.from({ length: 16 }, (_, i) => i + 1);
    const viewportPx: Vec2 = [1920, 1080];

    const passEncoder = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    renderer.pickRing(passEncoder, viewProj, viewportPx, 1000);

    const pickCameraBuffer = buffersByLabel.get('structure-marker-pick-camera');
    const drawTimeBuffer = buffersByLabel.get('structure-marker-uniforms');
    expect(pickCameraBuffer).toBeDefined();
    expect(drawTimeBuffer).toBeDefined();
    expect(bufferSizesByLabel.get('structure-marker-pick-camera')).toBe(CAMERA_UNIFORM_BYTES);

    // The pick-time pose lands on pickRing's OWN buffer as the prefix —
    // never on the draw-time `structure-marker-uniforms` buffer, which still
    // holds the last VISUAL frame's pose. Regression: writing to the
    // draw-time buffer here reintroduces the stale-pose pick bug.
    const [target, offset, payload] = (
      device.queue.writeBuffer as ReturnType<typeof vi.fn>
    ).mock.calls.at(-1) as [GPUBuffer, number, Float32Array];
    expect(target).toBe(pickCameraBuffer);
    expect(offset).toBe(0);
    expect(payload.byteLength).toBe(CAMERA_UNIFORM_BYTES);
    expect(Array.from(payload.subarray(0, 16))).toEqual(
      Array.from(narrowMat4(rebaseViewProj(viewProj, [0, 0, 0]))),
    );
    expect(payload[16]).toBe(viewportPx[0]);
    expect(payload[17]).toBe(viewportPx[1]);
    expect(device.queue.writeBuffer).not.toHaveBeenCalledWith(
      drawTimeBuffer,
      expect.anything(),
      expect.anything(),
    );

    const pickCameraBindGroup = bindGroupsByLabel.get('structure-marker-pick-camera-bg');
    expect(pickCameraBindGroup).toBeDefined();

    const setBindGroupMock = passEncoder.setBindGroup as ReturnType<typeof vi.fn>;
    const slot0PickCameraCallIndex = setBindGroupMock.mock.calls.findIndex(
      (args: unknown[]) => args[0] === 0 && args[1] === pickCameraBindGroup,
    );
    expect(slot0PickCameraCallIndex).toBeGreaterThanOrEqual(0);

    const drawMock = passEncoder.draw as ReturnType<typeof vi.fn>;
    expect(drawMock.mock.calls.length).toBeGreaterThan(0);
    const setBindGroupOrder = setBindGroupMock.mock.invocationCallOrder[slot0PickCameraCallIndex]!;
    const firstDrawOrder = drawMock.mock.invocationCallOrder[0]!;
    expect(setBindGroupOrder).toBeLessThan(firstDrawOrder);
  });
});

describe('StructureMarkerRenderer instance eye', () => {
  it('setMarkers packs positions relative to the camera', () => {
    const writes: Float32Array[] = [];
    const device = {
      createBindGroupLayout: vi.fn(() => ({})),
      createPipelineLayout: vi.fn(() => ({})),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
      createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({ label: desc.label, destroy: vi.fn() })),
      createBindGroup: vi.fn(() => ({})),
      queue: {
        writeBuffer: vi.fn((_b: GPUBuffer, _o: number, data: Float32Array) => writes.push(data)),
      },
    } as unknown as GPUDevice;
    const renderer = createStructureMarkerRenderer(
      {
        device,
        context: null as unknown as GPUCanvasContext,
        format: 'bgra8unorm' as GPUTextureFormat,
        canvas: null as unknown as HTMLCanvasElement,
        hdrCapable: false,
      },
      'rgba16float',
      {} as unknown as FadeUniformsBgl,
      false,
      'depth24plus',
      false,
      STRUCTURE_IDS,
    );
    writes.length = 0;
    renderer.setMarkers([{ ...cluster(1), worldPos: [100, 0, 0] }], [99.5, 0, 0]);
    const packed = writes.at(-1)!;
    expect(Array.from(packed.subarray(0, 3))).toEqual([0.5, 0, 0]);
  });

  it('setMarkers carries pickability in the lane after the ring colour', () => {
    const writes: Float32Array[] = [];
    const device = {
      createBindGroupLayout: vi.fn(() => ({})),
      createPipelineLayout: vi.fn(() => ({})),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
      createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({ label: desc.label, destroy: vi.fn() })),
      createBindGroup: vi.fn(() => ({})),
      queue: {
        writeBuffer: vi.fn((_b: GPUBuffer, _o: number, data: Float32Array) => writes.push(data)),
      },
    } as unknown as GPUDevice;
    const renderer = createStructureMarkerRenderer(
      {
        device,
        context: null as unknown as GPUCanvasContext,
        format: 'bgra8unorm' as GPUTextureFormat,
        canvas: null as unknown as HTMLCanvasElement,
        hdrCapable: false,
      },
      'rgba16float',
      {} as unknown as FadeUniformsBgl,
      false,
      'depth24plus',
      false,
      STRUCTURE_IDS,
    );
    renderer.setMarkers([cluster(1), { ...cluster(2), pickable: false }], [0, 0, 0]);
    const packed = writes.at(-1)!;
    // Two 13-float instances: the flag is the last lane of each, and the
    // descriptor order (the pick index) is untouched.
    expect(packed[12]).toBe(1);
    expect(packed[25]).toBe(0);
    expect(packed[13]).toBe(2);
  });

  it("pickRing rebases against the eye the instances were packed with, not the pick view's", () => {
    const writes: Float32Array[] = [];
    const device = {
      createBindGroupLayout: vi.fn(() => ({})),
      createPipelineLayout: vi.fn(() => ({})),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
      createBuffer: vi.fn((desc: GPUBufferDescriptor) => ({ label: desc.label, destroy: vi.fn() })),
      createBindGroup: vi.fn(() => ({})),
      queue: {
        writeBuffer: vi.fn((_b: GPUBuffer, _o: number, data: Float32Array) => writes.push(data)),
      },
    } as unknown as GPUDevice;
    const renderer = createStructureMarkerRenderer(
      {
        device,
        context: null as unknown as GPUCanvasContext,
        format: 'bgra8unorm' as GPUTextureFormat,
        canvas: null as unknown as HTMLCanvasElement,
        hdrCapable: false,
      },
      'rgba16float',
      {} as unknown as FadeUniformsBgl,
      false,
      'depth24plus',
      false,
      STRUCTURE_IDS,
    );
    const eyeA: [number, number, number] = [10, 20, 30];
    renderer.setMarkers([cluster(1)], eyeA);
    writes.length = 0;
    const vp = Float64Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : i * 0.01));
    const passEncoder = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    renderer.pickRing(passEncoder, vp, [800, 600], 1000);
    expect(Array.from(writes.at(-1)!.subarray(0, 16))).toEqual(
      Array.from(narrowMat4(rebaseViewProj(vp, eyeA))),
    );
  });
});
