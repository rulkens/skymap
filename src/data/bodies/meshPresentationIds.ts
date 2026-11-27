/**
 * MESH_PRESENTATION_IDS — every `MESH_PRESENTATIONS` id, as the roster `sceneBodyPartition`
 * takes when a reader wants every mesh body drawn this frame, whichever Layer owns it.
 */

import { MESH_PRESENTATIONS } from './meshPresentations';

export const MESH_PRESENTATION_IDS: ReadonlySet<string> = new Set(
  MESH_PRESENTATIONS.map((body) => body.id),
);
