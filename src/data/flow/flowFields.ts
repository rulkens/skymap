/**
 * FLOW_SLIDER_FIELDS — the one enumeration of the flow overlay's numeric knobs.
 *
 * The CF4++ flow overlay has nine user-facing leaves (`FlowSettings`). Seven of
 * them are plain numeric sliders; the other two are special controls (the
 * `enabled` master toggle on the section header, the `mode` segmented switch).
 * This module is the single home for the seven sliders' UI metadata — label,
 * which panel they surface in, range, granularity, value formatting — so the
 * SettingsPanel ("panel" surface) and the DebugPanel ("debug" surface) both
 * *iterate* this list instead of re-spelling each knob's range by hand.
 *
 * Why a registry: without it the field list would leak across many sites (both
 * panels' prop lists, the slider rows, the engine handle). Reifying the list
 * here and driving the React/handle/UI layers from a single
 * `Partial<FlowSettings>` patch means a new slider knob is one row here plus its
 * `FlowSettings` leaf + renderer clamp — the panels pick it up for free.
 *
 * The UI slider owns its `max` (single source of truth for the visible range);
 * the flow renderer's `clampFlowParams` is floor-only defence-in-depth at the
 * single point of use (the GPU-safe `MAX_PARTICLES` / `MIN_TRAIL_STEP` bounds).
 *
 * `enabled` / `mode` are deliberately NOT here: a boolean toggle and a string
 * union aren't sliders, and forcing them into a slider row would complect the
 * control kind with the field list. They're wired explicitly at their one call
 * site each. The parity test in `tests/data/flowFields.test.ts` asserts this
 * list covers exactly the *numeric* leaves of `DEFAULT_FLOW`, so a new numeric
 * knob can't silently skip the panels.
 */
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import { MAX_PARTICLES } from './flowFieldConstants';

/** Keys of `FlowSettings` that surface as numeric sliders (everything but `enabled`/`mode`). */
export type FlowSliderKey = Exclude<keyof FlowSettings, 'enabled' | 'mode'>;

/** Which panel a slider surfaces in. */
export type FlowSliderSurface = 'panel' | 'debug';

export type FlowSliderField = {
  key: FlowSliderKey;
  label: string;
  surface: FlowSliderSurface;
  /** Inclusive min for the range input. */
  min: number;
  /** Inclusive max — the UI owns the visible ceiling (single source of truth). */
  max: number;
  /** Slider granularity. */
  step: number;
  /** Pre-format the current value for the readout (e.g. `toFixed`/rounded count). */
  format: (value: number) => string;
  /** Optional hover tooltip. */
  title?: string;
};

export const FLOW_SLIDER_FIELDS: readonly FlowSliderField[] = [
  {
    key: 'intensity',
    label: 'Intensity',
    surface: 'panel',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Intensity — pre-blend ribbon brightness multiplier.',
  },
  {
    key: 'count',
    label: 'count',
    surface: 'debug',
    min: 0,
    max: MAX_PARTICLES,
    step: 500,
    format: (v) => String(Math.round(v)),
  },
  {
    key: 'trail',
    label: 'trail',
    surface: 'debug',
    min: 0,
    max: 0.02,
    step: 0.001,
    format: (v) => v.toFixed(3),
  },
  {
    key: 'flowSpeed',
    label: 'flowSpeed',
    surface: 'debug',
    min: 0,
    max: 0.5,
    step: 0.005,
    format: (v) => v.toFixed(3),
  },
  {
    key: 'densityBias',
    label: 'densityBias',
    surface: 'debug',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'wander',
    label: 'wander',
    surface: 'debug',
    min: 0,
    max: 0.3,
    step: 0.005,
    format: (v) => v.toFixed(3),
  },
  {
    key: 'boundaryFadeWidth',
    label: 'edgeFade',
    surface: 'debug',
    min: 0,
    max: 0.5,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
];

/**
 * Build a `FlowSettings` patch for a numeric slider field. The cast is sound:
 * every `FlowSliderKey` addresses a number-valued leaf of `FlowSettings`, but
 * a computed-key object literal widens to `{ [k: string]: number }`, which the
 * compiler won't narrow to `Partial<FlowSettings>` on its own. Localising the
 * cast here keeps every consumer (FlowRow, FlowTuningSection) type-clean.
 */
export function flowSliderPatch(key: FlowSliderKey, value: number): Partial<FlowSettings> {
  return { [key]: value } as Partial<FlowSettings>;
}
