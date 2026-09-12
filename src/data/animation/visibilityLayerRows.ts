/**
 * Every visibility key, classified. `satisfies Record<VisibilityLayerKey, …>` is what makes
 * the aggregate total: ANY new key — `…Label`-spelled or not — fails to compile until it
 * declares whether it belongs to an aggregate. A second aggregate is one more field VALUE,
 * not a new type. Declaration order is reveal order.
 */

import type { VisibilityLayerKey } from '../../@types/animation/VisibilityLayerKey';

export const VISIBILITY_LAYER_ROWS = {
  surveyLabel: { aggregate: 'labels' },
  structureLabel: { aggregate: 'labels' },
  milkyWayLabel: { aggregate: 'labels' },
  starCatalogLabel: { aggregate: 'labels' },
  bodyLabel: { aggregate: 'labels' },
  milkyWayDisk: {},
  proceduralDisks: {},
  texturedDisks: {},
  volumesMaster: {},
  scaleBar: {},
  structureRing: {},
  survey: {},
  filaments: {},
  flow: {},
  constellations: {},
  orbitTrails: {},
  volumeField: {},
  zoneOfAvoidance: {},
} as const satisfies Record<VisibilityLayerKey, { readonly aggregate?: 'labels' }>;
