/**
 * makeCubemapCaptureRuntimes — an `EngineState.cubemapCaptures` value for a
 * fixture: every row seeded the way `engine.ts` seeds it, with per-sky-row
 * overrides for the tests that need a row already in band. One helper, so a new
 * capture row is not an edit to every state fixture in the suite.
 */

import type { CubemapCaptureRuntimes } from '../../../src/@types/engine/state/CubemapCaptureRuntimes';
import type { SkyCaptureKey } from '../../../src/@types/rendering/SkyCaptureKey';
import type { SkyCaptureRuntime } from '../../../src/@types/engine/state/SkyCaptureRuntime';
import { APP_SKY_CAPTURE_KEYS } from '../../../src/compositions/appCubemapCaptures';

export function makeCubemapCaptureRuntimes(
  overrides: { readonly [K in SkyCaptureKey]?: Partial<SkyCaptureRuntime> } = {},
): CubemapCaptureRuntimes {
  const sky = Object.fromEntries(
    APP_SKY_CAPTURE_KEYS.map((key) => [
      key,
      {
        lastBandActive: false,
        lastAnchorDistanceMpc: Number.POSITIVE_INFINITY,
        bakedSettings: null,
        bakedContentVersion: null,
        lastBakeAtMs: null,
        ...overrides[key],
      },
    ]),
  ) as Record<SkyCaptureKey, SkyCaptureRuntime>;
  return {
    ...sky,
    probe: {
      subject: null,
      refreshedAtMs: new Map<string, number>(),
      due: false,
      refreshOwedInMs: null,
    },
  };
}
