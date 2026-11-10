/**
 * probeFaceDepthState — the depth state of an atmosphere pipeline drawing into a mesh
 * probe's capture face. That face's body step attaches the probe depth, so the pipeline
 * must name its format, but never tests or writes it: the probe sky draws before any
 * ground, and the outside shell's far wall sits behind the globe the face just stamped.
 */

import { FOREGROUND_DEPTH_FORMAT } from '../../../../data/renderTargetFormats';

export const PROBE_FACE_DEPTH_STATE: GPUDepthStencilState = {
  format: FOREGROUND_DEPTH_FORMAT,
  depthWriteEnabled: false,
  depthCompare: 'always',
};
