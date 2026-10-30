/**
 * visibleBodyRows — the frame's body-row candidates one view gives a `body-m` slab:
 * the rows `visibleSlabBodies` keeps, plus the hosts of the mesh bodies it keeps.
 * One home for that roster, so `deriveSlabs` and the surface-tile planner cannot
 * disagree about which bodies are on screen.
 */

import type { BodyRowGate } from '../../../@types/engine/frame/BodyRowGate';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { SlabRow } from '../../../@types/engine/frame/SlabRow';
import { meshBodySlabHostId } from '../../../utils/meshBodies/meshBodySlabHostId';
import { bodySlabRowOf } from '../../../utils/scene/bodySlabRowOf';
import { visibleSlabBodies } from './visibleSlabBodies';

export function visibleBodyRows(
  snapshot: Pick<ReadyFrameContext, 'bodyStates' | 'slabBodyCandidates' | 'meshBodies'>,
  gate: BodyRowGate,
): readonly SlabRow[] {
  const { bodyStates, slabBodyCandidates, meshBodies } = snapshot;
  const slabGate = { ...gate, bodyStates };
  const gatedRows = visibleSlabBodies({ ...slabGate, rows: slabBodyCandidates });
  // A hosted mesh body owns no slab row — it rides its host's
  // (`drawMeshBodiesOnRow`), so the host's roster entry is what keeps it drawable; a
  // hostless one keys on itself and is already a candidate. From a 400 km
  // orbit Earth's ~70° angular radius takes it out of the frustum gate around
  // 126° off-axis, which would blank a mesh body sitting dead centre. The SAME
  // gate run over the mesh bodies re-admits their hosts, so there is one cull
  // applied twice rather than two culls to keep in step. The body rides along
  // on the row so the surviving rows can name their hosts.
  const meshHostIds = new Set(
    visibleSlabBodies({
      ...slabGate,
      rows: meshBodies.map((body) => ({ ...bodySlabRowOf(body), body })),
    }).map((row) => meshBodySlabHostId(row.body.id)),
  );
  return gatedRows.concat(
    slabBodyCandidates.filter((row) => meshHostIds.has(row.anchorId) && !gatedRows.includes(row)),
  );
}
