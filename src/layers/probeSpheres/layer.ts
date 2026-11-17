/**
 * The probeSpheres Layer: three 50 m debug spheres (Earth orbit, Søndermarken, Jezero) drawn
 * through core's one mesh handle (glints through its own renderer), for judging the mesh
 * reflection probe. Off by default, one show item per sphere; the Debug panel's section sets
 * their shared material. It owns the `probeSphere` selection kind (unpicked, uncaptioned); a
 * sphere's InfoCard is the body card.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { PROBE_SPHERES_BODY_ROWS } from './bodies/probeSpheresBodyRows';
import { probeSpheresLayerSettings } from './state/slices';
import { probeSpheresVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { probeSphereMeshesPass } from './spheres/passes/probeSphereMeshesPass';
import { glintsPassOver } from '../../services/engine/frame/glintsPassOver';
import { PROBE_SPHERE_ROSTER } from './spheres/data/probeSphereRoster';
import { probeSphereSelectionRow } from './selection/probeSphereSelectionRow';
import { probeSpheresSelectionKinds } from './selection/kinds';
import ProbeSpheresTuningSectionContainer from './spheres/ui/ProbeSpheresTuningSectionContainer';
import BodyDetailCardContainer from '../body/card/ui/BodyDetailCardContainer';
import CompactBodyCard from '../../components/InfoCard/CompactBodyCard/CompactBodyCard';

export const probeSpheresLayer = defineLayer({
  name: 'probeSpheres',
  bodies: PROBE_SPHERES_BODY_ROWS,
  settings: probeSpheresLayerSettings,
  visibility: probeSpheresVisibility,
  create,
  destroy,
  passes: (runtime) => [
    probeSphereMeshesPass,
    glintsPassOver('probe-sphere-glints', PROBE_SPHERE_ROSTER, runtime.glintRenderer),
  ],
  selection: { kinds: probeSpheresSelectionKinds, rows: () => [probeSphereSelectionRow()] },
  ui: [
    { slot: 'debug', content: ProbeSpheresTuningSectionContainer },
    {
      slot: 'detailCard',
      content: { type: 'probeSphere', Detail: BodyDetailCardContainer, Compact: CompactBodyCard },
    },
  ],
});
