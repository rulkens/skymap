/**
 * deriveVolumeLiveness (pure core) — the clamp and the `hasActiveFields` gate,
 * isolated from any state/settings/fade read. A stub renderer + plain closures
 * stand in for the
 * `PassState`/`FrameView` a Layer's wrapper (e.g. `deriveCosmicWebDensityLiveness`) reads.
 */

import { describe, it, expect } from 'vitest';

import { deriveVolumeLiveness } from '../../../src/utils/volume/deriveVolumeLiveness';
import { clampVolumeIntensity } from '../../../src/utils/clampVolumeIntensity';
import type { VolumeFieldRenderer } from '../../../src/@types/rendering/VolumeFieldRenderer';
import type { VolumeFieldSettings } from '../../../src/@types/settings/VolumeFieldSettings';

type FieldId = 'mcpm';
const FIELD_ID: FieldId = 'mcpm';

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

function stubRenderer(
  hasActiveFields: VolumeFieldRenderer<FieldId>['hasActiveFields'] = () => true,
): VolumeFieldRenderer<FieldId> {
  return {
    label: 'stub',
    upload: () => {},
    unload: () => {},
    hasActiveFields,
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
      ),
    ).toBeNull();
  });

  it('settingsOf clamps the raw row at the read edge', () => {
    const renderer = stubRenderer();
    const liveness = deriveVolumeLiveness(
      renderer,
      () => rawSettings({ intensity: 5 }),
      () => 1,
    )!;
    const clamped = liveness.settingsOf(FIELD_ID);
    // The raw intensity 5 is clamped through clampVolumeIntensity.
    expect(clamped.intensity).toBe(clampVolumeIntensity(5));
  });
});
