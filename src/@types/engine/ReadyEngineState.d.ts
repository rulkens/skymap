/**
 * The `EngineState` shape after `isEngineReady` returns `true`.
 *
 * Every field listed here is one whose pre-bootstrap value is `null`
 * and whose post-bootstrap value is the genuinely-required handle.
 * Built via TypeScript intersection (`EngineState & { ... }`) so the
 * canonical `EngineState` declaration stays untouched — the narrowing
 * is purely an additive overlay on top of the existing shape.
 *
 * Excluded: `state.gpu.filamentRenderer`.  See
 * `services/engine/helpers/engineReady.ts`'s module header for the
 * deployment-path rationale.
 */

import type { EngineState } from './state/EngineState';
import type { OrbitCamera } from '../camera/OrbitCamera';
import type { PointRenderer } from '../rendering/PointRenderer';
import type { PickRenderer } from '../rendering/PickRenderer';
import type { PostProcess } from '../rendering/PostProcess';
import type { VolumeOffscreen } from '../rendering/VolumeOffscreen';
import type { TexturedImpostorSubsystem } from './subsystems/TexturedImpostorSubsystem';

export type ReadyEngineState = EngineState & {
  cam: OrbitCamera;
  gpu: EngineState['gpu'] & {
    renderer: PointRenderer;
    pickRenderer: PickRenderer;
    postProcess: PostProcess;
    /**
     * Non-null after bootstrap: `initGpu` allocates the half-res target
     * in lockstep with `postProcess`, so both are non-null at the same
     * moment.  The narrowing here lets `encodeVolumes` and
     * `volumeUpsamplePass` read `state.gpu.volumeOffscreen.view` without
     * a `!` assertion.
     */
    volumeOffscreen: VolumeOffscreen;
  };
  subsystems: EngineState['subsystems'] & {
    texturedImpostors: TexturedImpostorSubsystem;
  };
};
