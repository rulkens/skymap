/**
 * HOLED_MESH_BODY_BY_HOST — per host, the one mesh body whose terrain the
 * surface-tile pass cuts away: an `anchored` site whose `MESH_ASSETS` row
 * carries a `hole` rect. Derived, never authored. The tile pipeline binds a
 * single mask, so a second holed body on one host throws here at module load
 * rather than silently losing a hole.
 */

import type { HoledMeshBody } from '../../@types/scene/HoledMeshBody';
import { ANCHORED_MESH_BODY_IDS } from './anchoredMeshBodyIds';
import { MESH_ASSETS } from './meshAssets.generated';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';
import { SURFACE_FIXED_SITES } from './surfaceFixedSites';

export const HOLED_MESH_BODY_BY_HOST: ReadonlyMap<string, HoledMeshBody> =
  SURFACE_FIXED_SITES.reduce((acc, site) => {
    const body = SCENE_MESH_BODIES.find((b) => b.id === site.id);
    if (body === undefined || !ANCHORED_MESH_BODY_IDS.has(body.id)) return acc;
    const rect = MESH_ASSETS[body.meshKey]?.hole;
    if (rect === undefined) return acc;
    const taken = acc.get(site.hostId);
    if (taken !== undefined) {
      throw new Error(
        `HOLED_MESH_BODY_BY_HOST: '${site.hostId}' already cuts a hole for '${taken.body.id}'; ` +
          `'${body.id}' would be a second`,
      );
    }
    return acc.set(site.hostId, { body, rect });
  }, new Map<string, HoledMeshBody>());
