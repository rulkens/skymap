import type { HiResFamousTexture } from '../../rendering/hiResFamousTexture/HiResFamousTexture';
import type { HiResFamousSubsystem } from './hiResFamousSubsystem/HiResFamousSubsystem';

/**
 * Allocated together, bound together, destroyed together: the planner subscribes to the
 * texture's evict handler, so neither outlives the other.
 */
export type HiResFamousPair = {
  readonly texture: HiResFamousTexture;
  readonly subsystem: HiResFamousSubsystem;
};
