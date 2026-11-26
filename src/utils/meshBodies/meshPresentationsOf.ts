import type { LayerBody } from '../../@types/engine/layer/LayerBody';
import type { MeshPresentation } from '../../@types/scene/MeshPresentation';
import { isMeshBody } from './isMeshBody';

/** The rows that draw as a mesh: mesh bodies first, then bodies with a shape model. */
export function meshPresentationsOf(rows: readonly LayerBody[]): readonly MeshPresentation[] {
  const meshBodies = rows
    .map((row) => row.body)
    .filter(isMeshBody)
    .map(({ id, meshKey, boundingRadiusM, buildMesh, resolvePx, tierCeiling }) => ({
      id,
      meshKey,
      boundingRadiusM,
      buildMesh,
      resolvePx,
      tierCeiling,
    }));
  const shapeModels = rows.flatMap(({ body, shapeModel }) =>
    shapeModel === undefined ? [] : [{ id: body.id, ...shapeModel, resolvePx: body.resolvePx }],
  );
  return [...meshBodies, ...shapeModels];
}
