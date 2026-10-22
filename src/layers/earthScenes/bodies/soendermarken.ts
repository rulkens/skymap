/**
 * Søndermarken: the 2019 leaf-on photogrammetry scan of the park, an Earth
 * scene seated on the terrain. Leaf data: types and the mesh maker only.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';

export const SOENDERMARKEN: LayerBody = {
  // ~170 m bounding radius: the default 2-radii standoff would park the
  // camera the better part of a km up, well past where the park reads.
  body: meshBody({
    id: 'soendermarken',
    label: 'Søndermarken',
    meshKey: 'soendermarken',
    standoffRadii: 1.5,
  }),
  position: {
    kind: 'site',
    // Crop-bounds centre of the 2019 leaf-on photogrammetry scan (not the
    // source's own anchor, ~320 m east — see MESH_SOURCES.soendermarken).
    // altitudeM lifts the anchored seat 0.8 m above the source anchor's own
    // DVR90 height (buildSiteGroundHeights): the scan's lawn sits a hair below
    // the drawn terrain tiles, which are no longer cut away around it.
    site: {
      id: 'soendermarken',
      hostId: 'earth',
      latDeg: 55.670015,
      lonDeg: 12.524611,
      altitudeM: 0.8,
      seat: 'anchored',
    },
  },
  // The scan is already authored with +X east (no bodyFromSource remap), so
  // heading 90 puts body +X on east with no rotation left to apply.
  rotation: { kind: 'surfaceLocked', id: 'soendermarken', headingDeg: 90 },
};
