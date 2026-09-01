/**
 * SGR_A_STAR_LENSING_SLIDER_FIELDS — TEMPORARY (Task 15), deleted at the
 * removal step. UI metadata for the Sgr A* lens pass's DebugPanel sliders —
 * same shape as `data/zoneOfAvoidance/zoneOfAvoidanceSliderFields.ts`: label,
 * range, granularity and formatting live in ONE row per knob.
 * `cubemapResolutionPx` isn't here — see `SgrAStarLensingSliderKey`.
 */
import type { SgrAStarLensingTuning } from '../../@types/settings/SgrAStarLensingTuning';
import type { SgrAStarLensingSliderKey } from '../../@types/data/sgrAStarLensing/SgrAStarLensingSliderKey';
import type { SgrAStarLensingSliderField } from '../../@types/data/sgrAStarLensing/SgrAStarLensingSliderField';

export const SGR_A_STAR_LENSING_SLIDER_FIELDS: readonly SgrAStarLensingSliderField[] = [
  {
    key: 'innerRs',
    label: 'innerRs',
    min: 1,
    max: 10,
    step: 0.1,
    format: (v) => v.toFixed(1),
    title: 'Emission annulus inner edge, Schwarzschild-radius units.',
  },
  {
    key: 'outerRs',
    label: 'outerRs',
    min: 1,
    max: 20,
    step: 0.1,
    format: (v) => v.toFixed(1),
    title: 'Emission annulus outer edge, Schwarzschild-radius units.',
  },
  {
    key: 'inclinationRad',
    label: 'inclinationRad',
    min: 0,
    max: Math.PI / 2,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Disk inclination, radians (0 = face-on).',
  },
  {
    key: 'positionAngleRad',
    label: 'positionAngleRad',
    min: 0,
    max: 2 * Math.PI,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Disk major-axis position angle, radians.',
  },
  {
    key: 'flickerAmp',
    label: 'flickerAmp',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Fractional brightness modulation amplitude.',
  },
  {
    key: 'flickerTimescaleS',
    label: 'flickerTimescaleS',
    min: 10,
    max: 600,
    step: 1,
    format: (v) => v.toFixed(0),
    title: 'Flicker period, seconds.',
  },
  {
    key: 'diskScaleHeightRs',
    label: 'diskScaleHeightRs',
    min: 0.05,
    max: 2,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Vertical falloff scale height, Schwarzschild-radius units.',
  },
  {
    key: 'edgeFadeStartFraction',
    label: 'edgeFadeStartFraction',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: "Escape branch's edge-fade start, as a fraction of the frame's derived edge-fade end.",
  },
  {
    key: 'dopplerStrength',
    label: 'dopplerStrength',
    min: 0,
    max: 2,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Doppler-beaming strength factor.',
  },
  {
    key: 'emissionStrength',
    label: 'emissionStrength',
    min: 0,
    // Generous both ways for judging faintness against the spec's "faint
    // EHT-style glow" — SliderField has no log/curve option (a plain native
    // range input), so a fine linear step stands in for log-ish granularity
    // near 1x rather than a true log scale.
    max: 8,
    step: 0.05,
    format: (v) => v.toFixed(2),
    title:
      "Overall multiplier on the annulus emission's summed output intensity. 1 = today's brightness.",
  },
  {
    key: 'skyCubemapRecaptureCameraMoveFraction',
    label: 'recaptureMoveFraction',
    min: 0.005,
    max: 0.2,
    step: 0.005,
    format: (v) => v.toFixed(3),
    title:
      'Escape-valve movement threshold, as a fraction of the camera-to-Sgr-A* distance, that forces a full 6-face sky-cubemap resweep.',
  },
];

/**
 * Build a `SgrAStarLensingTuning` patch for one slider field. The cast is
 * sound: every `SgrAStarLensingSliderKey` addresses a number-valued leaf, but
 * a computed-key object literal widens to `{ [k: string]: number }`, which
 * the compiler won't narrow on its own — the same trick `zoneOfAvoidanceSliderPatch`
 * uses.
 */
export function sgrAStarLensingSliderPatch(
  key: SgrAStarLensingSliderKey,
  value: number,
): Partial<SgrAStarLensingTuning> {
  return { [key]: value } as Partial<SgrAStarLensingTuning>;
}
