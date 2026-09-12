import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import { Source } from '../source';

/**
 * Mesh-drawn scene bodies, as one row: lit triangle-mesh bodies rendered by
 * the mesh-body pipeline — the whale and the basket of petunias in Earth
 * orbit, Voyager 1/2, and the four Mars rovers (Curiosity, Perseverance,
 * Spirit, Opportunity). `label`/`plural` name the CATEGORY, not the
 * occupants, because the Labels & Guides checkbox this row seeds mutes every
 * mesh body's caption together; naming any occupant would read as a
 * per-body toggle, which a single registry row cannot be. A per-body split
 * needs a second entry.
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
