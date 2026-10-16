/**
 * sceneBodyPartition — core's own bodies (the planets and the present mesh bodies, found
 * by core's rosters) out of the frame's one scene-body sort, four ways: `glints` their
 * unresolved; their resolved into `meshes`, `textured` or `flat`. Every consumer reads this
 * one binding, so no body is textured to one pass and flat to another (z-fighting).
 * Residency is asked of the renderer (`hasMap` on the surface map), never the loading
 * system: a committed slot stops implying a bound texture once one can come from an atlas.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import type { MeshBody } from '../../../@types/scene/MeshBody';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import { isMeshBody } from '../../../utils/meshBodies/isMeshBody';
import { bodyTextureSpec } from '../../../data/bodies/bodyTextureRegistry';
import { sceneBodyPresentation } from './sceneBodyPresentation';

export function sceneBodyPartition(
  state: PassState,
  ctx: FrameView,
): {
  glints: readonly (PlanetBody | MeshBody)[];
  flat: readonly PlanetBody[];
  textured: readonly PlanetBody[];
  meshes: readonly MeshBody[];
} {
  const own = new Set<SceneBody>([...state.data.bodies.planets, ...ctx.snapshot.meshBodies]);
  const isOwn = (body: SceneBody): body is PlanetBody | MeshBody => own.has(body);
  const { unresolved, resolved } = sceneBodyPresentation(ctx);
  const glints: (PlanetBody | MeshBody)[] = [];
  const flat: PlanetBody[] = [];
  const textured: PlanetBody[] = [];
  const meshes: MeshBody[] = [];

  for (const { body } of unresolved) if (isOwn(body)) glints.push(body);
  for (const { body } of resolved) {
    if (!isOwn(body)) continue;
    // A MeshBody has no bodyTextureSpec entry, so it routes on TYPE before the
    // residency check — otherwise it silently falls to flat.
    if (isMeshBody(body)) meshes.push(body);
    // The renderer is keyed by `BodyTextureId`; a non-registry id misses its Map (→ flat),
    // and before the GPU is up nothing is bound, hence the `?? false`.
    else if (
      bodyTextureSpec(body.id) !== null &&
      (state.gpu.texturedBodyRenderer?.hasMap(body.id as BodyTextureId, 'surface') ?? false)
    )
      textured.push(body);
    else flat.push(body);
  }

  return { glints, flat, textured, meshes };
}
