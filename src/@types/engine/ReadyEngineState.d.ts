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
import type { TexturedImpostorSubsystem } from './subsystems/TexturedImpostorSubsystem';

export type ReadyEngineState = EngineState & {
  cam: OrbitCamera;
  gpu: EngineState['gpu'] & {
    renderer: PointRenderer;
    pickRenderer: PickRenderer;
    postProcess: PostProcess;
  };
  subsystems: EngineState['subsystems'] & {
    texturedImpostors: TexturedImpostorSubsystem;
  };
};
