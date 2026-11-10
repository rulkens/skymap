import type { FieldHostTuning } from './FieldHostTuning';
import type { GalaxyFieldHost } from './GalaxyFieldHost';

export type FieldHostSlotDeps = {
  /** The app's wraps `createGalaxyFieldHost(...).host`, dropping the tool's `debug`. */
  readonly create: () => GalaxyFieldHost;
  /** Stable identity per `dust`, so an unchanged frame re-tunes nothing. */
  readonly tuningFor: (dust: boolean) => FieldHostTuning;
};
