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
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import { fadeBand } from '../../../../src/utils/math/fadeBand';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { VolumeFieldId } from '../../../../src/@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../../src/@types/settings/VolumeFieldSettings';

const FIELD_ID = 'mcpm' as VolumeFieldId;

/**
 * A raw (unclamped) VolumeFieldSettings whose intensity is out of range.
 * Defaults `bands` to today's one-size-fits-all `surveyDeepZoom`, so tests
 * that don't care about band choice keep the pre-Prep-1 behaviour.
 */
function rawSettings(over: Partial<VolumeFieldSettings> = {}): VolumeFieldSettings {
  return {
    enabled: true,
    intensity: 5, // deliberately > 1 so clampVolumeIntensity is observable
    contrast: 1,
    densityScale: 1,
    paletteId: 'viridis' as VolumeFieldSettings['paletteId'],
    trim: 0,
    exposure: 1,
    bands: [SCALE_FADE_BANDS.surveyDeepZoom],
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
      // Always-1 stub — no clip plays in these fixtures; the clip factor is neutral.
      clipPlayer: { clipOpacityOf: () => 1 },
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

  it('a field with custom bands uses them, not surveyDeepZoom', () => {
    // A recede band ("full close, gone far") — the shape the Edenhofer dust
    // field's outer edge wants — full well inside surveyDeepZoom's goneAt
    // edge (0.002 Mpc), where the default band would already read 0.
    const outer = { fullAt: 0.001, goneAt: 0.01 };
    const state = makeState({ items: { [FIELD_ID]: rawSettings({ bands: [outer] }) } });
    const liveness = deriveVolumeLiveness(state, makeCtx({ drawCamPos: [0, 0, 0.0005] }))!;
    expect(liveness.fadeOpacityOf(FIELD_ID)).toBeCloseTo(1, 6);
  });

  it('a field with no fadeBands entry behaves byte-identically to surveyDeepZoom today', () => {
    // Deep inside surveyDeepZoom's goneAt edge with the default band → 0,
    // exactly the pre-Prep-1 behaviour every existing field (MCPM, CF-4,
    // polyphorm) still gets.
    const state = makeState({ items: { [FIELD_ID]: rawSettings() } });
    const liveness = deriveVolumeLiveness(state, makeCtx({ drawCamPos: [0, 0, 0.0005] }))!;
    expect(liveness.fadeOpacityOf(FIELD_ID)).toBe(0);
  });

  it('multiple bands multiply (outer × inner trapezoid)', () => {
    const outer = { fullAt: 0.01, goneAt: 0.03 }; // recede: full close, gone far
    const inner = { fullAt: 0.001, goneAt: 0.0001 }; // approach: full far, gone close
    const state = makeState({ items: { [FIELD_ID]: rawSettings({ bands: [outer, inner] }) } });

    // Inside both full ranges → product 1.
    const midLive = deriveVolumeLiveness(state, makeCtx({ drawCamPos: [0, 0, 0.005] }))!;
    expect(midLive.fadeOpacityOf(FIELD_ID)).toBeCloseTo(1, 6);

    // Past the outer band's fullAt (into its fractional ramp) but still past
    // the inner band's fullAt → product equals the outer factor alone.
    const rampCtx = makeCtx({ drawCamPos: [0, 0, 0.02] });
    const rampLive = deriveVolumeLiveness(state, rampCtx)!;
    const expectedOuter = fadeBand(outer, 0.02);
    expect(expectedOuter).toBeGreaterThan(0);
    expect(expectedOuter).toBeLessThan(1);
    expect(rampLive.fadeOpacityOf(FIELD_ID)).toBeCloseTo(expectedOuter, 6);
  });

  it('a settings row missing bands (stale persisted state) falls back to surveyDeepZoom', () => {
    // Simulates a row persisted before `bands` existed — present at runtime
    // without it despite the type. Must dissolve like every other field
    // rather than crash or read as always-on.
    const stale = { ...rawSettings(), bands: undefined } as unknown as VolumeFieldSettings;
    const state = makeState({ items: { [FIELD_ID]: stale } });
    const deep = deriveVolumeLiveness(state, makeCtx({ drawCamPos: [0, 0, 0.0005] }))!;
    expect(deep.fadeOpacityOf(FIELD_ID)).toBe(0);
    const far = deriveVolumeLiveness(state, makeCtx())!;
    expect(far.fadeOpacityOf(FIELD_ID)).toBeGreaterThan(0);
  });
});
