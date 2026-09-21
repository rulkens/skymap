/**
 * domeFaceSpecs — the dome rig's five `ViewSpec`s, one per `dome-cube` layer:
 * `domeFaceRotations` turns each face into the camera's own basis, and each
 * one's `output` is that face's own layer view — never the canvas.
 */

import type { EngineState } from '../../@types/engine/state/EngineState';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { ViewSpec } from '../../@types/engine/frame/ViewSpec';
import type { Vec3 } from '../../@types/math/Vec3';
import { DOME_FACE_COUNT } from '../../data/rendering/domeFaces';
import { DOME_PARAMS } from '../../data/rendering/domeParams';
import { domeFaceRotations } from '../dome/domeFaceRotations';
import { symmetricFrustum } from './symmetricFrustum';

export function domeFaceSpecs(canvas: FrameView, _state: EngineState): readonly ViewSpec[] {
  const rotations = domeFaceRotations(DOME_PARAMS.tiltDeg);
  const frustum = symmetricFrustum(Math.PI / 2, 1);
  const eyeOffsetMpc: Vec3 = [0, 0, 0];
  const specs: ViewSpec[] = [];
  for (let i = 0; i < DOME_FACE_COUNT; i++) {
    specs.push({
      rotation: rotations[i]!,
      eyeOffsetMpc,
      frustum,
      sizePx: canvas.canvasSize,
      slot: DOME_PARAMS.viewSlotBase + i,
      kind: 'frame',
      output: canvas.snapshot.renderTargets.layerViewOf('dome-cube', i),
    });
  }
  return specs;
}
