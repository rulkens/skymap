/**
 * sceneBodyPartition — the roster's bodies out of the frame's one scene-body sort, four
 * ways: `glints` their unresolved; their resolved into `meshes`, `textured` or `flat`.
 * Every consumer reads this one binding, so no body is textured to one pass and flat to
 * another (z-fighting).
 * Residency is asked of the renderers (`hasMesh`, the caller's `hasSurfaceMap`), never the
 * loading system: a body draws its mesh once resident and its sphere until then; a mission
 * mesh body has no sphere, so a non-resident one is in no bucket at all (invisible, never a
 * wrong shape).
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { SceneBodyPartition } from '../../../@types/engine/frame/SceneBodyPartition';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import type { MeshBody } from '../../../@types/scene/MeshBody';
import type { MeshPresentation } from '../../../@types/scene/MeshPresentation';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import { isMeshBody } from '../../../utils/meshBodies/isMeshBody';
import { meshPresentationOf } from '../../../utils/meshBodies/meshPresentationOf';
import { sceneBodyPresentation } from './sceneBodyPresentation';

export function sceneBodyPartition(
  state: PassState,
  ctx: FrameView,
  roster: ReadonlySet<string>,
  hasSurfaceMap: (bodyId: string) => boolean,
): SceneBodyPartition {
  const isOwn = (body: SceneBody): body is PlanetBody | MeshBody => roster.has(body.id);
  const { unresolved, resolved } = sceneBodyPresentation(ctx);
  const glints: (PlanetBody | MeshBody)[] = [];
  const flat: PlanetBody[] = [];
  const textured: PlanetBody[] = [];
  const meshes: MeshPresentation[] = [];

  for (const { body } of unresolved) if (isOwn(body)) glints.push(body);
  for (const { body } of resolved) {
    if (!isOwn(body)) continue;
    const mesh = meshPresentationOf(body.id);
    if (mesh !== null && (state.gpu.meshBodyRenderer?.hasMesh(body.id) ?? false)) meshes.push(mesh);
    else if (isMeshBody(body)) continue;
    else if (hasSurfaceMap(body.id)) textured.push(body);
    else flat.push(body);
  }

  return { glints, flat, textured, meshes };
}
