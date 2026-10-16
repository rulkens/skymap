/**
 * deriveCosmicWebDensityLiveness — the state reads behind live density work:
 * each field's opacity is the value core hands, scaled only by its own distance
 * bands. The clamp, band fold and `hasActiveFields` gate are the pure core's tests.
 */

import { describe, it, expect } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { deriveCosmicWebDensityLiveness } from '../../../../src/layers/cosmicWebDensity/present/deriveCosmicWebDensityLiveness';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';
import { STRONG_RECESSION } from '../../../../src/services/engine/presentation/focusRecession';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { CosmicWebDensityRuntime } from '../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';

const RUNTIME = {
  renderer: {
    hasActiveFields: (_settingsOf: unknown, fadeOpacityOf: (id: string) => number) =>
      fadeOpacityOf('mcpm') > 0,
  },
} as unknown as CosmicWebDensityRuntime;

const CTX = {
  snapshot: { isReady: true, nowMs: 0, focusBlend: 0, focusPickId: null },
  vp: new Float32Array(16) as unknown as Mat4,
  slabs: [],
  canvasSize: { width: 1280, height: 720 },
  // Inside every field's bands, so only the handed value moves the answer.
  drawCamPos: [0, 0, 1] as Readonly<[number, number, number]>,
} as unknown as FrameView;

const STATE = { settings: INITIAL_SETTINGS } as unknown as PassState;

const fadeOf = (mcpm: number) => ({ mcpm, 'polyphorm-2mrs': 0, 'mcpm-workbench': 0 });

describe('deriveCosmicWebDensityLiveness', () => {
  it('is null while every field is handed 0', () => {
    expect(deriveCosmicWebDensityLiveness(RUNTIME, STATE, CTX, fadeOf(0))).toBeNull();
  });

  it('is live while a field is handed a value above 0, and reads that value', () => {
    const live = deriveCosmicWebDensityLiveness(RUNTIME, STATE, CTX, fadeOf(0.5));
    expect(live).not.toBeNull();
    expect(live!.fadeOpacityOf('mcpm')).toBeGreaterThan(0);
    expect(live!.fadeOpacityOf('mcpm')).toBeLessThanOrEqual(0.5);
    expect(live!.fadeOpacityOf('polyphorm-2mrs')).toBe(0);
  });

  it('each field recedes strongly at full focus', () => {
    const atFocus = { ...CTX, snapshot: { ...CTX.snapshot, focusBlend: 1 } } as FrameView;
    const atRest = deriveCosmicWebDensityLiveness(RUNTIME, STATE, CTX, fadeOf(1))!;
    const focused = deriveCosmicWebDensityLiveness(RUNTIME, STATE, atFocus, fadeOf(1))!;
    expect(focused.fadeOpacityOf('mcpm')).toBeCloseTo(
      atRest.fadeOpacityOf('mcpm') * STRONG_RECESSION,
    );
  });
});
