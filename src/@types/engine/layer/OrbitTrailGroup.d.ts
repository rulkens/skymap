import type { ShowKey } from '../../animation/ShowKey';
import type { OrbitalElements } from '../../scene/OrbitalElements';

export type OrbitTrailGroup = {
  /** The show entry whose value fades this group's trails. */
  readonly show: ShowKey;
  readonly rows: readonly OrbitalElements[];
};
