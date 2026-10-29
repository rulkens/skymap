/**
 * URL_HASH_FOR — table-dispatch coverage for the `#focus=<id>` body.
 *
 * One assertion per arm: the galaxy row delegates to the codec ladder
 * (`selectionToFocusId`); the structure row returns the structure's own id.
 */
import { describe, it, expect } from 'vitest';
import { URL_HASH_FOR } from '../../../src/services/url/urlHashFor';
import { MILKY_WAY_FOCUS_ID } from '../../../src/services/url/milkyWayFocusId';
import { MILKY_WAY_INFO } from '../../../src/data/milkyWay/milkyWayInfo';
import { selectionToFocusId } from '../../../src/services/url/focusUrl';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import { ALL_KINDS_ENABLED } from '../../support/allKindsEnabled';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { bodySelectionRow } from '../../../src/layers/body/present/bodySelectionRow';
import { craftSelectionRow } from '../../../src/layers/missions/present/craftSelectionRow';
import { earthSceneSelectionRow } from '../../../src/layers/earthScenes/present/earthSceneSelectionRow';
import type { CraftInfo } from '../../../src/@types/engine/CraftInfo';
import type { EarthSceneInfo } from '../../../src/@types/engine/EarthSceneInfo';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';
import type { BodyInfo } from '../../../src/@types/engine/BodyInfo';
import type { StarInfo } from '../../../src/@types/engine/StarInfo';
import type { BlackHoleInfo } from '../../../src/@types/engine/BlackHoleInfo';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { Source } from '../../../src/data/sources';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

function makeGalaxy(source: number): GalaxyInfo {
  return {
    type: 'galaxyCatalog',
    source,
    objID: 1234567890n,
    famous: undefined,
    ra: 10,
    dec: 20,
  } as unknown as GalaxyInfo;
}

function makeStructure(id: string): StructureInfo {
  return {
    type: 'structure',
    id,
    name: id,
    category: 'galaxy-cluster',
    worldPos: [0, 0, 0],
    featured: true,
    physicalRadiusMpc: 2,
  };
}

describe('URL_HASH_FOR', () => {
  it('galaxyCatalog row returns the selectionToFocusId value', () => {
    const galaxy = makeGalaxy(Source.SDSS);
    expect(URL_HASH_FOR.galaxyCatalog(galaxy)).toBe(selectionToFocusId(galaxy));
    expect(URL_HASH_FOR.galaxyCatalog(galaxy)).toBe('sdss-1234567890');
  });

  it('structure row returns the structure id', () => {
    expect(URL_HASH_FOR.structure(makeStructure('cluster-virgo-m87'))).toBe('cluster-virgo-m87');
  });

  it('milkyWay row returns the fixed deep-link literal', () => {
    expect(URL_HASH_FOR.milkyWay(MILKY_WAY_INFO)).toBe(MILKY_WAY_FOCUS_ID);
    expect(URL_HASH_FOR.milkyWay(MILKY_WAY_INFO)).toBe('milkyWay');
  });

  it('#focus=body-<id> round-trips for a body', () => {
    // A focused body (BodyInfo) encodes to `body-<id>` under the shared prefix,
    // and the composed resolver decodes it back to the body ref — the
    // deep-link round-trip the feature exists for. The body row validates the id
    // against the body seed tables (no loaded catalog needed).
    const moon: BodyInfo = {
      type: 'body',
      id: asSceneBodyId('moon'),
      label: 'Moon',
      positionMpc: [1e-6, 2e-6, 3e-6],
    };
    const resolver = selectionResolverOver({ byId: () => null, byCategory: () => [] });
    const id = URL_HASH_FOR.body(moon);
    expect(id).toBe('body-moon');
    expect(resolver.resolveFocusId(id as string)).toEqual({ type: 'body', id: 'moon' });
  });

  it('#focus=body-<id> round-trips for a craft, to the craft kind', () => {
    // Craft deep links keep the body prefix; only the craft row may claim them back.
    const hubble: CraftInfo = {
      type: 'craft',
      id: asSceneBodyId('hubble'),
      label: 'Hubble',
      positionMpc: [1e-6, 2e-6, 3e-6],
    };
    const resolver = composeSelectionRows(
      () => [bodySelectionRow(), craftSelectionRow()],
      () => ALL_KINDS_ENABLED,
    );
    const id = URL_HASH_FOR.craft(hubble);
    expect(id).toBe('body-hubble');
    expect(resolver.resolveFocusId(id as string)).toEqual({ type: 'craft', id: 'hubble' });
  });

  it('#focus=body-<id> round-trips for an Earth scene, to the earthScene kind', () => {
    const park: EarthSceneInfo = {
      type: 'earthScene',
      id: asSceneBodyId('soendermarken'),
      label: 'Søndermarken',
      positionMpc: [1e-6, 2e-6, 3e-6],
    };
    const resolver = composeSelectionRows(
      () => [bodySelectionRow(), earthSceneSelectionRow()],
      () => ALL_KINDS_ENABLED,
    );
    const id = URL_HASH_FOR.earthScene(park);
    expect(id).toBe('body-soendermarken');
    expect(resolver.resolveFocusId(id as string)).toEqual({
      type: 'earthScene',
      id: 'soendermarken',
    });
  });

  it('#focus=star-<seedId> round-trips for a seeded star', () => {
    // The star arm encodes through the shared encoder, so a seeded star names its
    // durable id rather than its table index — the link survives a seed reorder.
    const index = SCENE_STARS.findIndex((star) => star.id === 'sirius');
    const sirius = {
      type: 'starCatalog',
      source: Source.FamousStar,
      index,
      displayName: 'Sirius',
    } as unknown as StarInfo;
    expect(URL_HASH_FOR.starCatalog(sirius)).toBe('star-sirius');
  });

  it('blackHole ref encodes blackhole-<id>', () => {
    const sgrAStar = { type: 'blackHole', id: 'sgr-a-star' } as unknown as BlackHoleInfo;
    expect(URL_HASH_FOR.blackHole(sgrAStar)).toBe('blackhole-sgr-a-star');
  });
});
