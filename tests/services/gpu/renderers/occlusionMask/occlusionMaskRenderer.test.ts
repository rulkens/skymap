/**
 * occlusionMaskRenderer against a mocked GPUDevice, with the real `?static` imports so
 * weslStaticPlugin links `occlusionMask/vertex.wesl` and `fragment.wesl` (and through it
 * `lib/sceneDepth.wesl`) under Vitest.
 */

import { describe, expect, it, vi } from 'vitest';
import type { OverlaySceneOcclusion } from '../../../../../src/@types/rendering/OverlaySceneOcclusion';
import { OCCLUSION_COVERAGE_GROUP_INDEX } from '../../../../../src/services/gpu/renderers/labels/occlusionCoverageGroup';
import { createOcclusionMaskRenderer } from '../../../../../src/services/gpu/renderers/occlusionMask/occlusionMaskRenderer';
import fsCode from '../../../../../src/services/gpu/shaders/occlusionMask/fragment.wesl?static';

function mockDevice() {
  const bindGroups: GPUBindGroupDescriptor[] = [];
  const pipelineLayouts: GPUPipelineLayoutDescriptor[] = [];
  const device = {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn((desc: GPUBindGroupLayoutDescriptor) => ({ of: desc.label })),
    createPipelineLayout: vi.fn((desc: GPUPipelineLayoutDescriptor) => {
      pipelineLayouts.push(desc);
      return {};
    }),
    createRenderPipeline: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroup: vi.fn((desc: GPUBindGroupDescriptor) => {
      bindGroups.push(desc);
      return { of: desc.label };
    }),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
  return { device, bindGroups, pipelineLayouts };
}

describe('createOcclusionMaskRenderer', () => {
  it('binds the overlay joint at the group the shader declares it in', () => {
    const m = mockDevice();
    const renderer = createOcclusionMaskRenderer({ device: m.device, targetFormat: 'rg32float' });
    const scene = {
      colorView: { id: 'color' },
      depthView: { id: 'depth' },
      frame: null,
    } as unknown as OverlaySceneOcclusion;
    const pass = { setPipeline: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn() };
    renderer.draw(pass as unknown as GPURenderPassEncoder, scene, [640, 480]);

    expect(Array.from(m.pipelineLayouts[0]!.bindGroupLayouts)).toHaveLength(
      OCCLUSION_COVERAGE_GROUP_INDEX + 1,
    );
    const joint = m.bindGroups.at(-1)!;
    expect(pass.setBindGroup).toHaveBeenCalledWith(OCCLUSION_COVERAGE_GROUP_INDEX, {
      of: joint.label,
    });
    expect(Array.from(joint.entries).map((e) => e.resource)).toEqual([
      scene.colorView,
      scene.depthView,
      expect.objectContaining({ buffer: expect.anything() }),
    ]);
    expect(pass.draw).toHaveBeenCalledWith(3);
  });

  it('the linked fragment keeps the joint in group(1) and writes both channels', () => {
    expect(fsCode).toMatch(/@group\(1\)\s*@binding\(1\)/);
    expect(fsCode).toContain('sceneSurfaceKm');
    expect(fsCode).toContain('NO_SURFACE_KM');
  });
});
