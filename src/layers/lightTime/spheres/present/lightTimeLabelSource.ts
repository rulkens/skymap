/**
 * lightTimeLabelSource — one caption per sphere, on the top of its silhouette (the style lifts
 * by one angular radius from Earth's centre). Not clickable. The style's pixel band and the
 * fills-the-view rule fade a caption as its sphere shrinks or swallows the view; the label
 * entry's `of` keeps it from outliving or preceding the spheres.
 */

import { labelSource } from '../../../../utils/labels/labelSource';
import { NEAR0 } from '../../../../services/engine/frame/slabs';
import { EARTH_REF } from '../../../../data/selection/earthRef';
import { LIGHT_TIME_SPHERES } from '../data/lightTimeSpheres';

export function lightTimeLabelSource() {
  return labelSource({
    slab: NEAR0,
    toggle: 'lightTime',
    style: 'lightTime',
    items: () => LIGHT_TIME_SPHERES,
    describe: (sphere) => ({
      text: sphere.text,
      position: { anchorId: EARTH_REF.id },
      subjectRadiusMpc: sphere.radiusMpc,
    }),
  });
}
