import type { ShowKey } from '../../animation/ShowKey';
import type { OrbitalElements } from '../../scene/OrbitalElements';
import type { SceneBodyId } from '../../scene/SceneBodyId';

export type OrbitTrailGroup = {
  /** The show entry whose value fades this group's trails. */
  readonly show: ShowKey;
  readonly rows: readonly OrbitalElements[];
  /** Rows, by id, that draw only while their body is selected or focused. */
  readonly selectedOnly?: readonly SceneBodyId[];
};
