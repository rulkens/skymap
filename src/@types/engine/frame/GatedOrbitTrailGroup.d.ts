import type { OrbitTrailGroup } from '../layer/OrbitTrailGroup';
import type { FrameView } from './FrameView';

export type GatedOrbitTrailGroup = OrbitTrailGroup & {
  /** The group's handed value (fade × clip × distance band) at this view, resolved by core
   * on each call; 0 while hidden. */
  fade(view: FrameView): number;
};
