/**
 * deriveVolumeLiveness — the single per-frame projection both volume layers
 * (the half-res `scalar-volume` raymarch and the `volume-upsample` blit)
 * consume to decide whether volume work runs this frame, and with which
 * per-field read closures.
 *
 * Pre-unification the same fact lived in two hand-mirrored gates (one for
 * the raymarch, one for `volumeUpsampleLayer.enabled`) that could drift
 * on three axes (clamp, recession, the fade-tail check). These tests pin the
 * ONE derivation: null when there's no live volume work, otherwise the
 * `settingsOf` (clamped) + `fadeOpacityOf` (recessed-master-multiplied)
 * closures.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { deriveVolumeLiveness } from '../../../../src/services/engine/frame/volumeLiveness';
import { clampVolumeIntensity } from '../../../../src/utils/clampVolumeIntensity';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { VolumeFieldId } from '../../../../src/@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../../src/@types/settings/VolumeFieldSettings';

const FIELD_ID = 'mcpm' as VolumeFieldId;

/** A raw (unclamped) VolumeFieldSettings whose intensity is out of range. */
function rawSettings(over: Partial<VolumeFieldSettings> = {}): VolumeFieldSettings {
  return {
    enabled: true,
    intensity: 5, // deliberately > 1 so clampVolumeIntensity is observable
    contrast: 1,
    densityScale: 1,
    paletteId: 'viridis' as VolumeFieldSettings['paletteId'],
    trim: 0,
    exposure: 1,
    ...over,
  };
}

/**
 * Build a minimal ReadyFrameContext — deriveVolumeLiveness reads only
 * `nowMs`, `focusBlend`, and `drawCamPos` (the survey-fade key; the 5 Mpc
 * default sits far outside the band so it is factor 1 unless overridden).
 */
function makeCtx(over: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  return {
    isReady: true,
    nowMs: 0,
    focusBlend: 0,
    vp: new Float32Array(16) as unknown as Mat4,
    slabs: [],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    ...over,
  } as unknown as ReadyFrameContext;
}

type StateInit = {
  renderer?: unknown;
  volumesEnabled?: boolean;
  masterOpacity?: number;
  fieldOpacity?: number;
  hasActiveFields?: (settingsOf: unknown, fadeOpacityOf: unknown) => boolean;
  items?: Record<string, VolumeFieldSettings>;
};

function makeState(init: StateInit = {}): EngineState {
  // A `fades` stub whose opacityOf answers by FadeId kind so the master gate
  // and the per-field opacity multiplier can be driven independently.
  const opacityOf = (h: { kind: string }) =>
    h.kind === 'volumesMaster' ? (init.masterOpacity ?? 1) : (init.fieldOpacity ?? 1);
  const renderer =
    init.renderer === undefined
      ? { hasActiveFields: init.hasActiveFields ?? (() => true), listIds: () => [FIELD_ID] }
      : init.renderer;
  return {
    gpu: { volumeFieldRenderer: renderer },
    settings: {
      volumes: { enabled: init.volumesEnabled ?? true, items: init.items ?? {} },
    },
    subsystems: {
      fades: { opacityOf: vi.fn(opacityOf) },
      // clipPlayer omitted → resolveLayerOpacity's clip factor defaults to 1.
    },
  } as unknown as EngineState;
}

describe('deriveVolumeLiveness', () => {
  it('returns null when the renderer is missing (pre-bootstrap)', () => {
    expect(deriveVolumeLiveness(makeState({ renderer: null }), makeCtx())).toBeNull();
  });

  it('returns null when master is off AND the master fade is fully out', () => {
    // volumes.enabled false and volumesMaster opacity 0 → no live volume work.
    const state = makeState({ volumesEnabled: false, masterOpacity: 0 });
    expect(deriveVolumeLiveness(state, makeCtx())).toBeNull();
  });

  it('returns null when no field is active (hasActiveFields false)', () => {
    const state = makeState({ hasActiveFields: () => false });
    expect(deriveVolumeLiveness(state, makeCtx())).toBeNull();
  });

  it('stays live through a master fade-out tail even with the toggle off', () => {
    // Toggle off but the master fade hasn't reached zero → still live so the
    // ~100 ms ramp keeps drawing.
    const state = makeState({ volumesEnabled: false, masterOpacity: 0.5 });
    expect(deriveVolumeLiveness(state, makeCtx())).not.toBeNull();
  });

  it('returns settingsOf/fadeOpacityOf closures when a field is live', () => {
    const state = makeState();
    const liveness = deriveVolumeLiveness(state, makeCtx());
    expect(liveness).not.toBeNull();
    expect(typeof liveness!.settingsOf).toBe('function');
    expect(typeof liveness!.fadeOpacityOf).toBe('function');
  });

  it('settingsOf clamps the raw store record at the read edge', () => {
    const state = makeState({ items: { [FIELD_ID]: rawSettings({ intensity: 5 }) } });
    const liveness = deriveVolumeLiveness(state, makeCtx())!;
    const clamped = liveness.settingsOf(FIELD_ID);
    expect(clamped).toBeDefined();
    // The store's raw intensity 5 is clamped through clampVolumeIntensity.
    expect(clamped!.intensity).toBe(clampVolumeIntensity(5));
  });

  it('settingsOf returns undefined for a field with no store record', () => {
    const state = makeState({ items: {} });
    const liveness = deriveVolumeLiveness(state, makeCtx())!;
    expect(liveness.settingsOf(FIELD_ID)).toBeUndefined();
  });

  it('fadeOpacityOf multiplies the per-field fade by the recessed master', () => {
    // fieldOpacity 0.5, masterOpacity 1, no focus recession (blend 0) and no
    // clip → recessedMaster 1, so fadeOpacityOf(id) === 0.5 × 1.
    const state = makeState({ fieldOpacity: 0.5, masterOpacity: 1 });
    const liveness = deriveVolumeLiveness(state, makeCtx({ focusBlend: 0 }))!;
    expect(liveness.fadeOpacityOf(FIELD_ID)).toBeCloseTo(0.5, 6);
  });

  it('returns null at deep zoom — the survey fade zeroes every field through the closure', () => {
    // Camera inside the surveyDeepZoom goneAt edge (0.002 Mpc from origin):
    // the band factor multiplies into fadeOpacityOf, so a hasActiveFields
    // that reads through the closure (as the real renderer does) sees 0 for
    // every field — liveness null, BOTH volume layers disabled by
    // construction. The field is otherwise fully active (toggle on, master
    // 1), so the band is the only thing shutting it. No famous-style
    // exemption exists for volumes.
    const state = makeState({
      hasActiveFields: (_settingsOf, fadeOpacityOf) =>
        (fadeOpacityOf as (id: VolumeFieldId) => number)(FIELD_ID) > 0,
      items: { [FIELD_ID]: rawSettings() },
    });
    const deepCtx = makeCtx({
      drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]>,
    });
    expect(deriveVolumeLiveness(state, deepCtx)).toBeNull();
    // Same state, far camera → live (proves the band, not the fixture).
    expect(deriveVolumeLiveness(state, makeCtx())).not.toBeNull();
  });
});
