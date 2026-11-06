import { describe, expect, it } from 'vitest';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { SkyCaptureKey } from '../../../../src/@types/rendering/SkyCaptureKey';
import { skyCapturesBaking } from '../../../../src/services/engine/frame/skyCapturesBaking';
import { makeCubemapCaptureRuntimes } from '../../../helpers/engine/makeCubemapCaptureRuntimes';

const SETTINGS = {} as EngineSettingsState;
// `sgrAStar` re-bakes on a settings or content change; `solarSystem` bakes once per band entry.
const BOTH = new Set<SkyCaptureKey>(['sgrAStar', 'solarSystem']);
const settled = makeCubemapCaptureRuntimes({
  sgrAStar: { bakedSettings: SETTINGS, bakedContentVersion: 0 },
  solarSystem: { bakedSettings: SETTINGS, bakedContentVersion: 0 },
});
const baking = (over: Partial<Parameters<typeof skyCapturesBaking>[0]>) =>
  skyCapturesBaking({
    inBand: BOTH,
    captures: settled,
    settings: SETTINGS,
    contentVersion: 0,
    fadesAnimating: false,
    ...over,
  });

describe('skyCapturesBaking', () => {
  it('bakes nothing once every in-band row holds a settled bake', () => {
    expect(baking({})).toEqual(new Set());
  });

  it('bakes a row with nothing usable baked, and only rows in band', () => {
    const captures = makeCubemapCaptureRuntimes();
    expect(baking({ captures })).toEqual(BOTH);
    expect(baking({ captures, inBand: new Set(['solarSystem']) })).toEqual(
      new Set(['solarSystem']),
    );
  });

  it('re-bakes only the rebakeOnSettings row after a settings or content change', () => {
    expect(baking({ settings: {} as EngineSettingsState })).toEqual(new Set(['sgrAStar']));
    expect(baking({ contentVersion: 1 })).toEqual(new Set(['sgrAStar']));
  });

  it('bakes every in-band row while a fade animates', () => {
    expect(baking({ fadesAnimating: true })).toEqual(BOTH);
  });
});
