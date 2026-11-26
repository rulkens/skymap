/**
 * MESH_PRESENTATIONS — every scene body drawn as a mesh (baked or generated), keyed by body id.
 * The mesh path (`meshPresentationOf`, `meshBodiesAttachedTo`, and each Layer's own mesh asset rows) reads this table; the
 * identity consumers (labels, trails, presence, captions, pick tables) keep
 * reading their own, so drawing a body as a mesh never changes what it IS.
 */

import type { MeshPresentation } from '../../@types/scene/MeshPresentation';
import { APP_BODY_REGISTRY } from '../../compositions/appBodies';
import { meshPresentationsOf } from '../../utils/meshBodies/meshPresentationsOf';

export const MESH_PRESENTATIONS: readonly MeshPresentation[] =
  meshPresentationsOf(APP_BODY_REGISTRY);
