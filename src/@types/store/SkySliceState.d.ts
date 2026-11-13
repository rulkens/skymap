import type { SkyBelowHorizon } from '../sky/SkyBelowHorizon';
import type { SkyEntryFacts } from '../engine/SkyEntryFacts';
import type { SkyView } from '../engine/SkyView';

export type SkySliceState = {
  /** The centre spot sky entry would use; republished only on a metre of travel or an altitude-gate flip. */
  readonly entry: SkyEntryFacts;
  /** Non-null exactly while the camera frame is `sky`: the one fact that says the viewer stands (D9). */
  readonly view: SkyView;
  readonly belowHorizon: SkyBelowHorizon | null;
};
