/**
 * device.ts — verify `initGpu` requests `timestamp-query` when the
 * adapter advertises it, and silently skips when it doesn't.
 *
 * We stub `navigator.gpu` end-to-end because the real WebGPU API
 * is unavailable under jsdom.  The test asserts the
 * `adapter.requestDevice` call site receives the expected
 * `requiredFeatures` array.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initGpu } from '../../../src/services/gpu/device';

function makeFakeCanvas(): HTMLCanvasElement {
  const ctx = {
    configure: vi.fn(),
  } as unknown as GPUCanvasContext;
  return {
    getContext: vi.fn(() => ctx),
    clientWidth: 1280,
    clientHeight: 720,
    width: 1280,
    height: 720,
  } as unknown as HTMLCanvasElement;
}

function installFakeGpu(adapterFeatures: ReadonlyArray<string>): {
  requestDeviceSpy: ReturnType<typeof vi.fn>;
} {
  const requestDeviceSpy = vi.fn(async (desc?: GPUDeviceDescriptor) => {
    return {
      features: new Set(desc?.requiredFeatures ?? []),
      queue: {},
    } as unknown as GPUDevice;
  });
  const adapter = {
    features: new Set(adapterFeatures),
    requestDevice: requestDeviceSpy,
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      gpu: {
        requestAdapter: vi.fn(async () => adapter),
        getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
      },
    },
  });
  return { requestDeviceSpy };
}

describe('initGpu — timestamp-query negotiation', () => {
  let originalNavigator: typeof globalThis.navigator | undefined;

  beforeEach(() => {
    originalNavigator = (globalThis as { navigator?: typeof globalThis.navigator }).navigator;
  });

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
      });
    }
  });

  it('requests `timestamp-query` when the adapter advertises it', async () => {
    const { requestDeviceSpy } = installFakeGpu(['timestamp-query']);
    await initGpu(makeFakeCanvas());
    expect(requestDeviceSpy).toHaveBeenCalledTimes(1);
    const desc = requestDeviceSpy.mock.calls[0]![0] as GPUDeviceDescriptor;
    expect(desc.requiredFeatures).toContain('timestamp-query');
  });

  it('omits `timestamp-query` when the adapter does not advertise it', async () => {
    const { requestDeviceSpy } = installFakeGpu([]);
    await initGpu(makeFakeCanvas());
    expect(requestDeviceSpy).toHaveBeenCalledTimes(1);
    const desc = requestDeviceSpy.mock.calls[0]![0] as GPUDeviceDescriptor;
    const features = (desc.requiredFeatures ?? []) as ReadonlyArray<string>;
    expect(features).not.toContain('timestamp-query');
  });
});
