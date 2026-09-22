/**
 * deriveVolumeLiveness (pure core) — the clamp, the per-field band fold, and
 * the `hasActiveFields` gate, isolated from any state/settings/fade read. A
 * stub renderer + plain closures + a camera distance stand in for the
 * `PassState`/`FrameView` a Layer's wrapper (e.g. `volumeLiveness.ts`) reads.
 */

import { describe, it, expect } from 'vitest';

import { deriveVolumeLiveness } from '../../../src/utils/volume/deriveVolumeLiveness';
import { clampVolumeIntensity } from '../../../src/utils/clampVolumeIntensity';
import { SCALE_FADE_BANDS } from '../../../src/services/engine/presentation/scaleFadeBands';
import { fadeBand } from '../../../src/utils/math/fadeBand';
import type { VolumeFieldRenderer } from '../../../src/@types/rendering/VolumeFieldRenderer';
import type { VolumeFieldSettings } from '../../../src/@types/settings/VolumeFieldSettings';

type FieldId = 'mcpm';
const FIELD_ID: FieldId = 'mcpm';

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

function stubRenderer(
  hasActiveFields: VolumeFieldRenderer<FieldId>['hasActiveFields'] = () => true,
): VolumeFieldRenderer<FieldId> {
  return {
    label: 'stub',
    upload: () => {},
    unload: () => {},
    hasActiveFields,
    listIds: () => [FIELD_ID],
    draw: () => {},
    destroy: () => {},
  };
}

describe('deriveVolumeLiveness (pure core)', () => {
  it('returns null when no field is active (hasActiveFields false)', () => {
    const renderer = stubRenderer(() => false);
    expect(
      deriveVolumeLiveness(
        renderer,
        () => rawSettings(),
        () => 1,
        5,
      ),
    ).toBeNull();
  });

  it('settingsOf clamps the raw row at the read edge', () => {
    const renderer = stubRenderer();
    const liveness = deriveVolumeLiveness(
      renderer,
      () => rawSettings({ intensity: 5 }),
      () => 1,
      5,
    )!;
    const clamped = liveness.settingsOf(FIELD_ID);
    expect(clamped).toBeDefined();
    // The raw intensity 5 is clamped through clampVolumeIntensity.
    expect(clamped!.intensity).toBe(clampVolumeIntensity(5));
  });

  it('settingsOf returns undefined for a field with no row', () => {
    const renderer = stubRenderer();
    const liveness = deriveVolumeLiveness(
      renderer,
      () => undefined,
      () => 1,
      5,
    )!;
    expect(liveness.settingsOf(FIELD_ID)).toBeUndefined();
  });

  it('returns null at deep zoom — the survey band zeroes every field through the closure', () => {
    // A renderer that reads through the composed fadeOpacityOf, as the real
    // one does: only the band factor decides liveness here (fieldSettingsOf
    // is otherwise fully on, fadeOpacityOf otherwise 1).
    const renderer = stubRenderer(
      (_settingsOf, fadeOpacityOf) => (fadeOpacityOf as (id: FieldId) => number)(FIELD_ID) > 0,
    );
    expect(
      deriveVolumeLiveness(
        renderer,
        () => rawSettings(),
        () => 1,
        0.001,
      ),
    ).toBeNull();
    // Same fixture, far camera → live (proves the band, not the fixture).
    expect(
      deriveVolumeLiveness(
        renderer,
        () => rawSettings(),
        () => 1,
        5,
      ),
    ).not.toBeNull();
  });

  it('a field with custom bands uses them, not surveyDeepZoom', () => {
    // A recede band ("full close, gone far") — the shape the Edenhofer dust
    // field's outer edge wants — full well inside surveyDeepZoom's goneAt
    // edge (0.002 Mpc), where the default band would already read 0.
    const outer = { fullAt: 0.001, goneAt: 0.01 };
    const renderer = stubRenderer();
    const liveness = deriveVolumeLiveness(
      renderer,
      () => rawSettings({ bands: [outer] }),
      () => 1,
      0.0005,
    )!;
    expect(liveness.fadeOpacityOf(FIELD_ID)).toBeCloseTo(1, 6);
  });

  it('a field with no fadeBands entry behaves byte-identically to surveyDeepZoom today', () => {
    const renderer = stubRenderer();
    const liveness = deriveVolumeLiveness(
      renderer,
      () => rawSettings(),
      () => 1,
      0.0005,
    )!;
    expect(liveness.fadeOpacityOf(FIELD_ID)).toBe(0);
  });

  it('multiple bands multiply (outer × inner trapezoid)', () => {
    const outer = { fullAt: 0.01, goneAt: 0.03 }; // recede: full close, gone far
    const inner = { fullAt: 0.001, goneAt: 0.0001 }; // approach: full far, gone close
    const renderer = stubRenderer();
    const fieldSettingsOf = () => rawSettings({ bands: [outer, inner] });

    // Inside both full ranges → product 1.
    const midLive = deriveVolumeLiveness(renderer, fieldSettingsOf, () => 1, 0.005)!;
    expect(midLive.fadeOpacityOf(FIELD_ID)).toBeCloseTo(1, 6);

    // Past the outer band's fullAt (into its fractional ramp) but still past
    // the inner band's fullAt → product equals the outer factor alone.
    const rampLive = deriveVolumeLiveness(renderer, fieldSettingsOf, () => 1, 0.02)!;
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
    const renderer = stubRenderer();
    const deep = deriveVolumeLiveness(
      renderer,
      () => stale,
      () => 1,
      0.0005,
    )!;
    expect(deep.fadeOpacityOf(FIELD_ID)).toBe(0);
    const far = deriveVolumeLiveness(
      renderer,
      () => stale,
      () => 1,
      5,
    )!;
    expect(far.fadeOpacityOf(FIELD_ID)).toBeGreaterThan(0);
  });
});
