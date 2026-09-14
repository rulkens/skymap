/**
 * meshBodyRenderer bind-group split.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call returns
 * a plausibly-shaped stand-in (the `texturedBodyRenderer.test.ts` pattern).
 * What's pinned here is the group SPLIT — per-body resources at group 0, the
 * renderer-wide sampler + env-BRDF LUT at group 1 — because a layout that
 * drifts from the shader's `@group`/`@binding` decorations only fails at
 * device-validation time in the browser, which no other check here reaches.
 */

import { describe, it, expect, vi } from 'vitest';
import { createMeshBodyRenderer } from '../../../../../src/services/gpu/renderers/bodies/meshBodyRenderer';
import { MESH_TEXTURE_SLOTS } from '../../../../../src/data/mesh/meshTextureSlots';
import type { MeshAsset } from '../../../../../src/@types/data/mesh/MeshAsset';

const LUT_VIEW = { __envBrdfView: true };

function stubLut(): GPUTexture {
  return { createView: () => LUT_VIEW } as unknown as GPUTexture;
}

type TextureStub = { desc: GPUTextureDescriptor; destroy: ReturnType<typeof vi.fn> };

function mockDevice(recorders?: {
  bindGroupLayouts?: GPUBindGroupLayoutDescriptor[];
  bindGroupDescs?: GPUBindGroupDescriptor[];
  samplers?: GPUSamplerDescriptor[];
  bindGroups?: Map<string, object>;
  textures?: TextureStub[];
}): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn((desc: GPUSamplerDescriptor) => {
      recorders?.samplers?.push(desc);
      return {};
    }),
    createTexture: vi.fn((desc: GPUTextureDescriptor) => {
      const texture = {
        desc,
        createView: () => ({}),
        destroy: vi.fn(),
        // generateMipChain reads mipLevelCount off the texture to size its loop.
        mipLevelCount: desc.mipLevelCount ?? 1,
        format: desc.format,
      };
      recorders?.textures?.push(texture);
      return texture;
    }),
    createBindGroupLayout: vi.fn((desc: GPUBindGroupLayoutDescriptor) => {
      recorders?.bindGroupLayouts?.push(desc);
      return {};
    }),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      recorders?.bindGroupDescs?.push(desc);
      const group = {};
      if (recorders?.bindGroups && typeof desc.label === 'string') {
        recorders.bindGroups.set(desc.label, group);
      }
      return group;
    }),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn(() => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        draw: vi.fn(),
        end: vi.fn(),
      })),
      finish: vi.fn(() => ({})),
    })),
    queue: {
      writeBuffer: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
      submit: vi.fn(),
    },
  } as unknown as GPUDevice;
}

function makeRenderer(device: GPUDevice) {
  return createMeshBodyRenderer({
    device,
    targetFormat: 'rgba16float',
    depthFormat: 'depth32float',
    reversedZ: false,
    envBrdfLut: stubLut(),
  });
}

function stubAsset(): MeshAsset {
  const bitmap = { width: 2, height: 2 } as unknown as ImageBitmap;
  return {
    boundingRadiusM: 1,
    vertexCount: 3,
    indexCount: 3,
    positions: new Float32Array(9),
    normals: new Float32Array(9),
    tangents: new Float32Array(12),
    uvs: new Float32Array(6),
    indices: new Uint32Array([0, 1, 2]),
    albedo: bitmap,
    metalRough: bitmap,
    normalMap: bitmap,
  };
}

function stubPass(): GPURenderPassEncoder & { setBindGroup: ReturnType<typeof vi.fn> } {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder & { setBindGroup: ReturnType<typeof vi.fn> };
}

describe('createMeshBodyRenderer', () => {
  it('mints two bind-group layouts: the per-body one carries the uniform, MESH_TEXTURE_SLOTS and probe-cube bindings and no sampler', () => {
    const bindGroupLayouts: GPUBindGroupLayoutDescriptor[] = [];
    makeRenderer(mockDevice({ bindGroupLayouts }));
    expect(bindGroupLayouts).toHaveLength(2);

    // Binding 5 is the probe cube the fragment declares after the material maps.
    const bodyEntries = Array.from(bindGroupLayouts[0]!.entries);
    expect(bodyEntries.map((e) => e.binding)).toEqual([
      0,
      ...MESH_TEXTURE_SLOTS.map((s) => s.binding),
      5,
    ]);
    expect(bodyEntries[bodyEntries.length - 1]!.texture!.viewDimension).toBe('cube');
    expect(bodyEntries.some((e) => e.sampler !== undefined)).toBe(false);
  });

  it('binds the LUT and its clamp sampler in the global group', () => {
    const bindGroupLayouts: GPUBindGroupLayoutDescriptor[] = [];
    const bindGroupDescs: GPUBindGroupDescriptor[] = [];
    const samplers: GPUSamplerDescriptor[] = [];
    makeRenderer(mockDevice({ bindGroupLayouts, bindGroupDescs, samplers }));

    // Layout and bind group must agree with the fragment's @group(1)
    // decorations: sampler, LUT texture, LUT sampler.
    const globalEntries = Array.from(bindGroupLayouts[1]!.entries);
    expect(globalEntries.map((e) => e.binding)).toEqual([0, 1, 2]);
    expect(globalEntries[1]!.texture).toBeDefined();
    expect(globalEntries[2]!.sampler).toBeDefined();

    const globalGroup = bindGroupDescs.find((d) => d.label === 'meshBody-global-bg')!;
    expect(Array.from(globalGroup.entries)[1]!.resource).toBe(LUT_VIEW);

    // Clamp-to-edge, not the material sampler's repeat: the LUT is indexed by
    // (NoV, roughness), so wrapping folds grazing NoV onto the NoV = 1 column.
    const lutSampler = samplers.find((s) => s.label === 'meshBody-lut-sampler')!;
    expect(lutSampler.addressModeU).toBe('clamp-to-edge');
    expect(lutSampler.addressModeV).toBe('clamp-to-edge');
  });

  it('setMesh mints a 6-layer rgba16float probe cube with a full mip chain and a depth texture, both destroyed by clearMesh', () => {
    const textures: TextureStub[] = [];
    const renderer = makeRenderer(mockDevice({ textures }));
    renderer.setMesh('a', stubAsset());

    const probe = renderer.probeOf('a')!;
    expect(probe).not.toBeNull();
    expect(renderer.probeOf('missing')).toBeNull();

    const cube = textures.find((t) => t.desc.format === 'rgba16float')!;
    expect(cube.desc.size).toEqual([probe.faceSizePx, probe.faceSizePx, 6]);
    expect(cube.desc.usage & GPUTextureUsage.RENDER_ATTACHMENT).toBeTruthy();
    // Full chain: the coarsest mip is 1 px, the roughness-1 level the diffuse term reads.
    expect(probe.faceSizePx >> (probe.mipLevelCount - 1)).toBe(1);
    expect(cube.desc.mipLevelCount).toBe(probe.mipLevelCount);

    const depth = textures.find((t) => t.desc.format === 'depth32float')!;
    expect(depth.desc.size).toEqual([probe.faceSizePx, probe.faceSizePx, 1]);

    renderer.clearMesh('a');
    expect(cube.destroy).toHaveBeenCalledTimes(1);
    expect(depth.destroy).toHaveBeenCalledTimes(1);
    expect(renderer.probeOf('a')).toBeNull();
  });

  it("draw binds the body's own group at index 0 and the shared group at index 1", () => {
    const bindGroups = new Map<string, object>();
    const renderer = makeRenderer(mockDevice({ bindGroups }));
    renderer.setMesh('a', stubAsset());
    renderer.setMesh('b', stubAsset());

    const pass = stubPass();
    renderer.draw(pass, 'a', new Float32Array(32));
    renderer.draw(pass, 'b', new Float32Array(32));

    const bound = pass.setBindGroup.mock.calls as [number, object][];
    const atIndex = (i: number) => bound.filter((c) => c[0] === i).map((c) => c[1]);
    expect(atIndex(0)).toEqual([bindGroups.get('meshBody-bg-a'), bindGroups.get('meshBody-bg-b')]);
    // One global group for the whole renderer: both draws bind the SAME object.
    const globals = atIndex(1);
    expect(globals).toHaveLength(2);
    expect(globals[0]).toBe(globals[1]);
    expect(globals[0]).not.toBe(bindGroups.get('meshBody-bg-a'));
  });
});
