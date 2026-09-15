/**
 * meshBodyRenderer bind-group split.
 *
 * Vitest runs in Node without a WebGPU surface, so every `create*` call returns
 * a plausibly-shaped stand-in (the `texturedBodyRenderer.test.ts` pattern).
 * What's pinned here is the group SPLIT — per-body resources at group 0, the
 * renderer-wide sampler at group 1 — because a layout that drifts from the
 * shader's `@group`/`@binding` decorations only fails at device-validation time
 * in the browser, which no other check here reaches.
 */

import { describe, it, expect, vi } from 'vitest';
import { createMeshBodyRenderer } from '../../../../../src/services/gpu/renderers/bodies/meshBodyRenderer';
import { MESH_TEXTURE_SLOTS } from '../../../../../src/data/mesh/meshTextureSlots';
import type { MeshAsset } from '../../../../../src/@types/data/mesh/MeshAsset';

function mockDevice(recorders?: {
  bindGroupLayouts?: GPUBindGroupLayoutDescriptor[];
  bindGroups?: Map<string, object>;
}): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createTexture: vi.fn((desc: GPUTextureDescriptor) => ({
      createView: () => ({}),
      destroy: vi.fn(),
      // generateMipChain reads mipLevelCount off the texture to size its loop.
      mipLevelCount: desc.mipLevelCount ?? 1,
      format: desc.format,
    })),
    createBindGroupLayout: vi.fn((desc: GPUBindGroupLayoutDescriptor) => {
      recorders?.bindGroupLayouts?.push(desc);
      return {};
    }),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
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
  it('mints two bind-group layouts: the per-body one carries the uniform + MESH_TEXTURE_SLOTS bindings and no sampler; the global one carries only the sampler', () => {
    const bindGroupLayouts: GPUBindGroupLayoutDescriptor[] = [];
    createMeshBodyRenderer(mockDevice({ bindGroupLayouts }), 'rgba16float', 'depth32float', false);
    expect(bindGroupLayouts).toHaveLength(2);

    const bodyEntries = Array.from(bindGroupLayouts[0]!.entries);
    expect(bodyEntries.map((e) => e.binding)).toEqual([
      0,
      ...MESH_TEXTURE_SLOTS.map((s) => s.binding),
    ]);
    expect(bodyEntries.some((e) => e.sampler !== undefined)).toBe(false);

    const globalEntries = Array.from(bindGroupLayouts[1]!.entries);
    expect(globalEntries).toHaveLength(1);
    expect(globalEntries[0]!.binding).toBe(0);
    expect(globalEntries[0]!.sampler).toBeDefined();
  });

  it("draw binds the body's own group at index 0 and the shared group at index 1", () => {
    const bindGroups = new Map<string, object>();
    const renderer = createMeshBodyRenderer(
      mockDevice({ bindGroups }),
      'rgba16float',
      'depth32float',
      false,
    );
    renderer.setMesh('a', stubAsset());
    renderer.setMesh('b', stubAsset());

    const pass = stubPass();
    renderer.draw(pass, 'a', new Float32Array(32));
    renderer.draw(pass, 'b', new Float32Array(32));

    const bound = pass.setBindGroup.mock.calls as [number, object][];
    const atIndex = (i: number) => bound.filter((c) => c[0] === i).map((c) => c[1]);
    expect(atIndex(0)).toEqual([bindGroups.get('meshBody-bg-a'), bindGroups.get('meshBody-bg-b')]);
    // One sampler group for the whole renderer: both draws bind the SAME object.
    const globals = atIndex(1);
    expect(globals).toHaveLength(2);
    expect(globals[0]).toBe(globals[1]);
    expect(globals[0]).not.toBe(bindGroups.get('meshBody-bg-a'));
  });
});
