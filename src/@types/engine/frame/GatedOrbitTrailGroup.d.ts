import type { OrbitTrailGroup } from '../layer/OrbitTrailGroup';
import type { ReadyFrameContext } from './ReadyFrameContext';

export type GatedOrbitTrailGroup = OrbitTrailGroup & {
  /** The group's show value (fade × clip), resolved by core on each call; 0 while hidden. */
  fade(snapshot: Pick<ReadyFrameContext, 'nowMs'>): number;
};
