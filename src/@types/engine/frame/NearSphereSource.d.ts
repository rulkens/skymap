import type { Vec3 } from '../../math/Vec3';
import type { BodyState } from '../../scene/BodyState';
import type { EngineSettingsState } from '../../settings/EngineSettingsState';
import type { NearSphere } from './NearSphere';

/** A Layer's `nearSpheres` member: the opaque spheres it draws on NEAR0, asked per
 *  camera because which star resolves to a sphere is a per-view question. */
export type NearSphereSource = {
  spheres(input: {
    /** The frame's one body sample, keyed one level wider than `BodyId` (stars too). */
    readonly bodyStates: ReadonlyMap<string, BodyState>;
    /** The source reads its own switches here. */
    readonly settings: EngineSettingsState;
    readonly camPosMpc: Readonly<Vec3>;
    readonly pxPerRad: number;
  }): readonly NearSphere[];
};
