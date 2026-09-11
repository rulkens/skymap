import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import { Source } from '../source';

/**
 * Mesh-drawn scene bodies — the whale and the basket of petunias in Earth
 * orbit, as one row. `label`/`plural` name the CATEGORY, not the occupants,
 * because the Labels & Guides checkbox this row seeds mutes both together;
 * "Whale & Petunias" would read as a per-body toggle, which a single registry
 * row cannot be. A per-body split needs a second entry.
 */
export const MESH_BODY_ENTRY = {
  type: 'body',
  code: Source.MeshBody,
  id: 'mesh-body',
  label: 'Mesh body',
  // A pair of bodies at the observer's near field, not a sky patch — allSky:true
  // matches the other non-catalog rows (the coverage mask reads it only for
  // galaxy-catalog footprints).
  allSky: true,
  visible: true,
  bearsLabel: true,
  labelLayer: 'body',
  bearsMarker: false,
  detailLabel: 'Mesh body',
  shortLabel: 'Mesh body',
  plural: 'Mesh bodies',
} as const satisfies BodySourceEntry;
