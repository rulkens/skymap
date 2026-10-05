/**
 * deriveCosmicWebDensityLiveness — the master gate's state reads: a toggle
 * that is off still draws until its fade-out tail reaches zero. The clamp, band
 * fold and `hasActiveFields` gate are the pure core's tests.
 */

import { describe, it, expect } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { deriveCosmicWebDensityLiveness } from '../../../../src/layers/cosmicWebDensity/present/deriveCosmicWebDensityLiveness';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { CosmicWebDensityRuntime } from '../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';

const RUNTIME = {
  renderer: { hasActiveFields: () => true, listIds: () => ['mcpm'] },
} as unknown as CosmicWebDensityRuntime;

const CTX = {
  snapshot: { isReady: true, nowMs: 0, focusBlend: 0 },
  vp: new Float32Array(16) as unknown as Mat4,
  slabs: [],
  canvasSize: { width: 1280, height: 720 },
  drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
} as unknown as FrameView;

function makeState(masterOpacity: number): PassState {
  return {
    settings: { cosmicWebDensity: { enabled: false, items: {} } },
    subsystems: {
      fades: {
        opacityOf: (h: { kind: string }) => (h.kind === 'cosmicWebDensity' ? masterOpacity : 1),
      },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as PassState;
}

describe('deriveCosmicWebDensityLiveness', () => {
  it('is null when the master is off and its fade is out', () => {
    expect(deriveCosmicWebDensityLiveness(RUNTIME, makeState(0), CTX)).toBeNull();
  });

  it('stays live through a master fade-out tail with the toggle off', () => {
    expect(deriveCosmicWebDensityLiveness(RUNTIME, makeState(0.5), CTX)).not.toBeNull();
  });
});
