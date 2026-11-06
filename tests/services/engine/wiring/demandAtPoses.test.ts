/**
 * demandAtPoses — the real composed rows (every scale-gated Layer's, plus the body and mesh rows)
 * through the one evaluator at real camera poses. Row declarations are never restated here: a
 * wrong band, edge or px threshold shows up as a catalog loading at the Earth boot view, or
 * not loading where it draws.
 */

import { describe, expect, it } from 'vitest';
import { expandCompanionRows } from '../../../../src/utils/loading/expandCompanionRows';
import { evaluateAssetDemand } from '../../../../src/services/engine/wiring/evaluateAssetDemand';
import { buildDemandCtx } from '../../../../src/services/engine/wiring/buildDemandCtx';
import { assertAssetDemands } from '../../../../src/services/engine/wiring/assertAssetDemands';
import { meshAssetRows } from '../../../../src/services/engine/wiring/meshAssetRows';
import { bodyAssetRows } from '../../../../src/layers/body/textures/load/bodyAssetRows';
import { bodyTextureSlotKey } from '../../../../src/layers/body/textures/load/bodyTextureSlotKey';
import { ALL_BODY_TEXTURE_KEYS } from '../../../../src/layers/body/textures/data/bodyTextureKeys';
import { galaxyCatalogAssetRows } from '../../../../src/layers/galaxyCatalog/records/load/galaxyCatalogAssetRows';
import { cosmicWebDensityAssetRows } from '../../../../src/layers/cosmicWebDensity/densityCubes/load/cosmicWebDensityAssetRows';
import { filamentsAssetRows } from '../../../../src/layers/cosmicWebFilaments/filaments/load/filamentsAssetRows';
import { flowAssetRows } from '../../../../src/layers/flow/streamlines/load/flowAssetRows';
import { structureAssetRows } from '../../../../src/layers/structure/catalog/load/structureAssetRows';
import { constellationsAssetRows } from '../../../../src/layers/constellations/figures/load/constellationsAssetRows';
import { localBubbleAssetRows } from '../../../../src/layers/localBubble/shell/load/localBubbleAssetRows';
import { galaxyCatalogVisibility } from '../../../../src/layers/galaxyCatalog/visibility';
import { cosmicWebDensityVisibility } from '../../../../src/layers/cosmicWebDensity/visibility';
import { cosmicWebFilamentsVisibility } from '../../../../src/layers/cosmicWebFilaments/visibility';
import { flowVisibility } from '../../../../src/layers/flow/visibility';
import { structureVisibility } from '../../../../src/layers/structure/visibility';
import { constellationsVisibility } from '../../../../src/layers/constellations/visibility';
import { localBubbleVisibility } from '../../../../src/layers/localBubble/visibility';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../../../src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows';
import { GALAXY_CATALOG_SOURCES } from '../../../../src/layers/galaxyCatalog/sources/galaxyCatalogSources';
import { bodyHomePose } from '../../../../src/services/engine/camera/framing/bodyHomePose';
import { DEFAULT_FOV_Y_RAD } from '../../../../src/services/engine/camera/framing/cameraFraming';
import { meshBodySlotKey } from '../../../../src/utils/meshBodies/meshBodySlotKey';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import { absoluteArm } from '../../../../src/utils/camera/arms/absoluteArm';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';
import { Source } from '../../../../src/data/source';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { AssetWiringRow } from '../../../../src/@types/loading/AssetWiringRow';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';
import type { CosmicWebDensityRuntime } from '../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { SelectionRefBase } from '../../../../src/@types/engine/selection/SelectionRefBase';
import type { VisibilityEntry } from '../../../../src/@types/engine/layer/VisibilityEntry';

const slot = (name: string) => ({ name }) as never;

const ENTRIES: readonly VisibilityEntry[] = [
  ...galaxyCatalogVisibility,
  ...cosmicWebDensityVisibility,
  ...cosmicWebFilamentsVisibility,
  ...flowVisibility,
  ...structureVisibility,
  ...constellationsVisibility,
  ...localBubbleVisibility,
];

const galaxyRows = expandCompanionRows(
  galaxyCatalogAssetRows({
    points: new Map(GALAXY_CATALOG_SOURCES.map((code) => [code, slot(String(code))])),
    famousGalaxiesMeta: slot('meta'),
    pgcAlias: slot('pgc'),
    hiResFamous: slot('hiRes'),
  } as unknown as GalaxyCatalogRuntime),
);
const pointRows = galaxyRows.filter((r) => r.gates !== undefined);
const surveyPoints = pointRows.filter((r) => r.key !== Source.FamousGalaxy);
const famousPoints = pointRows.filter((r) => r.key === Source.FamousGalaxy);
const densityRows = cosmicWebDensityAssetRows({
  slots: Object.fromEntries(COSMIC_WEB_DENSITY_SOURCE_ROWS.map(([, e]) => [e.id, slot(e.id)])),
} as unknown as CosmicWebDensityRuntime);
const filamentsRows = filamentsAssetRows({ slot: slot('filaments') } as never);
const flowRows = flowAssetRows({ slot: slot('flow') } as never);
const structureRows = structureAssetRows({ slot: slot('structure') });
const constellationRows = constellationsAssetRows({ slot: slot('constellations') } as never);
const bubbleRows = localBubbleAssetRows({ slot: slot('bubble') } as never);
const bodyRows = bodyAssetRows({
  textureSlots: new Map(
    ALL_BODY_TEXTURE_KEYS.map((e) => [bodyTextureSlotKey(e.bodyId, e.kind), slot('texture')]),
  ),
  atlasSlot: slot('atlas'),
} as unknown as BodyRuntime);
const meshRows = meshAssetRows({ gpu: { meshBodyRenderer: null } } as never);

const SURVEY_LAYERS = [...densityRows, ...filamentsRows, ...flowRows, ...structureRows];
const ALL_ROWS: readonly AssetWiringRow[] = [
  ...pointRows,
  ...SURVEY_LAYERS,
  ...constellationRows,
  ...bubbleRows,
  ...bodyRows,
  ...meshRows,
];
const rowOf = (rows: readonly AssetWiringRow[], key: AssetKey): AssetWiringRow =>
  rows.find((r) => r.key === key)!;

// 1080 px tall at the default 60 degree field of view.
const DRAW_PX_PER_RAD = 1080 / (2 * Math.tan(Math.PI / 6));
// Venus is near inferior conjunction (~0.27 AU).
const SIM_DAYS = unixMsToJulianDays(Date.parse('2026-11-06T12:00:00Z'));

/** Every switch on: this asks what the scale gates do, not what boots hidden. */
function switchedOn(node: unknown): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return node;
  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [
      k,
      k === 'enabled' || k === 'labelEnabled' ? true : switchedOn(v),
    ]),
  );
}

function ctxAt(pose: ReturnType<typeof absoluteArm>): DemandCtx {
  const settings = switchedOn(INITIAL_SETTINGS) as typeof INITIAL_SETTINGS;
  const state = {
    tier: 'medium',
    settings,
    ui: { paletteOpen: false },
    terrainHeightAt: datumOnlyTerrainHeight,
    drawPxPerRad: DRAW_PX_PER_RAD,
    cameraRuntime: {
      register: { pose },
      outputs: {
        displayed: pose,
        projection: { fovYRad: DEFAULT_FOV_Y_RAD, aspect: 16 / 9, near: 1e-12, far: 1e7 },
        simDays: SIM_DAYS,
        upBasis: ORIENTATION_FRAMES[settings.orientation],
      },
    },
    slotsByKey: new Map(),
    selection: { hover: null, select: null, focus: null },
  } as unknown as EngineState;
  return buildDemandCtx(state);
}

function earthBootCtx(): DemandCtx {
  const basis = ORIENTATION_FRAMES[INITIAL_SETTINGS.orientation];
  const home = bodyHomePose(asSceneBodyId('earth'), SIM_DAYS, DEFAULT_FOV_Y_RAD, basis);
  return ctxAt(absoluteArm(home));
}

const mpcPose = (distance: number) =>
  absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance });

const verdict = (row: AssetWiringRow, ctx: DemandCtx) => evaluateAssetDemand(row, ctx, ENTRIES);
const demands = (row: AssetWiringRow, ctx: DemandCtx) => verdict(row, ctx).demand;

describe('demand at poses (the real composed rows)', () => {
  it('every composed declaration resolves against the composed entries', () => {
    expect(() => assertAssetDemands(ALL_ROWS, ENTRIES)).not.toThrow();
  });

  it('at the Earth boot pose nothing invisible demands', () => {
    const ctx = earthBootCtx();
    for (const row of [...surveyPoints, ...SURVEY_LAYERS, ...bubbleRows]) {
      expect(demands(row, ctx), String(row.key)).toBe(false);
    }
    expect(demands(rowOf(meshRows, meshBodySlotKey('soendermarken')), ctx)).toBe(false);
    expect(demands(rowOf(bodyRows, 'venus:surface'), ctx)).toBe(false);
    expect(demands(rowOf(bodyRows, 'moon:surface'), ctx)).toBe(false);
  });

  it('at the Earth boot pose the Earth surface, atlas, famous catalog and constellations demand', () => {
    const ctx = earthBootCtx();
    for (const row of [
      rowOf(bodyRows, 'earth:surface'),
      rowOf(bodyRows, 'bodyTextureAtlas'),
      ...famousPoints,
      ...constellationRows,
    ]) {
      expect(demands(row, ctx), String(row.key)).toBe(true);
    }
  });

  // 2 Mpc, not 1: constellations release past 100 x their 10 kpc edge, which is exactly 1 Mpc.
  it('at 2 Mpc the survey layers demand and the neighbourhood layers release', () => {
    const ctx = ctxAt(mpcPose(2));
    for (const row of [...surveyPoints, ...famousPoints, ...SURVEY_LAYERS]) {
      expect(demands(row, ctx), String(row.key)).toBe(true);
    }
    for (const row of [...bubbleRows, ...constellationRows]) {
      expect(verdict(row, ctx), String(row.key)).toEqual({ demand: false, release: true });
    }
  });

  it('a selected survey galaxy loads its catalog from Earth', () => {
    const selectedKinds = new Set<SelectionRefBase['type']>(['galaxyCatalog']);
    const ctx = { ...earthBootCtx(), selectedKinds };
    for (const row of surveyPoints) expect(demands(row, ctx), String(row.key)).toBe(true);
  });
});
