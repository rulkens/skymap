/**
 * coreMeshBodiesPass — core's own bodies (Søndermarken, the shape-model moons) as lit meshes on
 * their host's body-m row.
 */

import { CORE_SCENE_BODY_IDS } from '../../../../data/bodies/coreSceneBodyIds';
import { meshBodiesPassOver } from '../meshBodiesPassOver';

export const coreMeshBodiesPass = meshBodiesPassOver('core-mesh-bodies', CORE_SCENE_BODY_IDS);
