import type { MeshPresentation } from '../../@types/scene/MeshPresentation';
import { MESH_PRESENTATIONS } from '../../data/bodies/meshPresentations';

const BY_ID = new Map(MESH_PRESENTATIONS.map((row) => [row.id, row]));

/** meshPresentationOf — the body's mesh presentation, or null if it draws as a sphere. */
export function meshPresentationOf(id: string): MeshPresentation | null {
  return BY_ID.get(id) ?? null;
}
