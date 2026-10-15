import { describe, it, expect, vi } from 'vitest';
import { createZoneOfAvoidanceRenderer } from '../../../../src/layers/zoneOfAvoidance/render/zoneOfAvoidanceRenderer';
import { ZONE_OF_AVOIDANCE_SHELL } from '../../../../src/data/zoneOfAvoidance/zoneOfAvoidanceShell';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { ZoneOfAvoidanceTuning } from '../../../../src/@types/settings/ZoneOfAvoidanceTuning';

// Minimal mock GPUDevice — Vitest runs in Node without a WebGPU surface.
// Mirrors horizonShellRenderer.test.ts / labelRenderer.test.ts's pattern:
// every create* call returns a plausibly-shaped stand-in; createRenderPipeline
// optionally records the descriptors so pipeline shape can be asserted.
function mockDevice(renderPipelines?: GPURenderPipelineDescriptor[]): GPUDevice {
  return {
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createBindGroupLayout: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines?.push(desc);
      return {};
    }),
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn(), copyExternalImageToTexture: vi.fn() },
  } as unknown as GPUDevice;
}

describe('createZoneOfAvoidanceRenderer', () => {
  it('builds a pick pipeline targeting r32uint with no blend and a depth test', () => {
    // Regression guard: a blend key on an integer target is a validation
    // error, and a missing depthStencil breaks occlusion against other
    // COSMO pick draws.
    const renderPipelines: GPURenderPipelineDescriptor[] = [];
    createZoneOfAvoidanceRenderer(mockDevice(renderPipelines), 'rgba16float');
    const pick = renderPipelines.find((p) => p.label === 'zoneOfAvoidance-pick-pipeline');
    expect(pick).toBeDefined();
    const target = Array.from(pick!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('r32uint');
    expect(target!.blend).toBeUndefined();
    expect(pick!.depthStencil).toBeDefined();
  });
});

describe('zoneOfAvoidanceRenderer window rect', () => {
  const CAM = {
    yaw: 0,
    pitch: 0,
    fovYRad: Math.PI / 3,
    aspect: 2,
    position: [0, 0, 1],
  } as unknown as OrbitCamera;
  const TUNING = {
    intensity: 1,
    radialFalloff: 0.5,
    edgeSharpness: 1,
    color: [1, 1, 1],
    labelColor: [1, 1, 1],
  } as ZoneOfAvoidanceTuning;
  const PASS = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;

  // The uniform scratch is reused across calls, so each write is copied.
  function build() {
    const device = mockDevice();
    const writes: Float32Array[] = [];
    vi.mocked(device.queue.writeBuffer).mockImplementation((_buf, _off, data) => {
      writes.push(new Float32Array(data as ArrayBuffer).slice());
    });
    const renderer = createZoneOfAvoidanceRenderer(device, 'rgba16float');
    const windowRect = () => Array.from(writes.at(-1)!.subarray(28, 32));
    return { renderer, windowRect };
  }

  it("drawPick writes the window's canvas-NDC rect at bytes 112–127", () => {
    const { renderer, windowRect } = build();
    const window = { originPx: [0, 0], sizePx: [1, 1] } as const;
    renderer.drawPick(PASS, CAM, [100, 50], window, TUNING, ZONE_OF_AVOIDANCE_SHELL, 1);
    const [cx, cy, hx, hy] = windowRect();
    expect(cx).toBeCloseTo(-0.99, 6);
    expect(cy).toBeCloseTo(0.98, 6);
    expect(hx).toBeCloseTo(0.01, 6);
    expect(hy).toBeCloseTo(0.02, 6);
  });

  it('draw writes the whole-canvas NDC rect', () => {
    const { renderer, windowRect } = build();
    const window = { originPx: [0, 0], sizePx: [1, 1] } as const;
    renderer.draw(PASS, CAM, [100, 50], TUNING, ZONE_OF_AVOIDANCE_SHELL, 1);
    expect(windowRect()).toEqual([0, 0, 1, 1]);
    // The buffer is shared, so a pick's rect must not leak.
    renderer.drawPick(PASS, CAM, [100, 50], window, TUNING, ZONE_OF_AVOIDANCE_SHELL, 1);
    renderer.draw(PASS, CAM, [100, 50], TUNING, ZONE_OF_AVOIDANCE_SHELL, 1);
    expect(windowRect()).toEqual([0, 0, 1, 1]);
  });
});
