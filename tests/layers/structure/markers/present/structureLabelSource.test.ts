/**
 * A structure label belongs to its scale's slab, names only featured structures, and picks what
 * a click on its ring does: the category's code over the per-category index, where an index
 * counted over the merged list would select a plausible, silently wrong structure.
 */

import { packPickWord } from '../../../../../src/data/selectionEncoding';
import { describe, expect, it } from 'vitest';

import { structureLabelSource } from '../../../../../src/layers/structure/markers/present/structureLabelSource';
import { structureSelectionRow } from '../../../../../src/layers/structure/selection/structureSelectionRow';
import { createStructureStore } from '../../../../../src/layers/structure/catalog/load/createStructureStore';
import { COSMO, NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';
import { structurePickCodes } from '../../../../support/layerPickCodes';

const STATE = {} as EngineState;
const record = (over: Partial<StructureInfo>) =>
  ({ worldPos: [10, 0, 5], physicalRadiusMpc: 5, featured: true, ...over }) as StructureInfo;

describe('structureLabelSource', () => {
  it('structures describe their labels', () => {
    const store = createStructureStore();
    store.setGroup('anchors', [
      record({ id: 'coma', name: 'Coma Cluster', category: 'galaxy-cluster' }),
      record({ id: 'boo', name: 'Bootes Void', category: 'void', apparentRadiusMpc: 30 }),
      record({ id: 'virgo', name: 'Virgo Cluster', category: 'galaxy-cluster' }),
      record({ id: 'bulk', name: 'Abell 1', category: 'galaxy-cluster', featured: false }),
      record({ id: 'm42', name: 'Orion Nebula', category: 'nebula' }),
    ]);
    const runtime = { store, pickCodes: structurePickCodes() };
    const cosmic = structureLabelSource(runtime, 'cosmic');
    const near = structureLabelSource(runtime, 'milkyWay');
    expect([cosmic.slab, near.slab]).toEqual([COSMO, NEAR0]);
    expect(near.items(STATE).map((p) => p.id)).toEqual(['m42']);
    expect(cosmic.changes!(STATE)).toBe(cosmic.changes!(STATE));

    const items = cosmic.items(STATE);
    expect(items.map((p) => p.id)).toEqual(['coma', 'boo', 'virgo']);
    const labels = items.map((p, i) => cosmic.describe(p, i)!);
    const row = structureSelectionRow(runtime);
    items.forEach((p, i) => {
      const { code, index } = labels[i]!.pick!;
      expect(packPickWord(code, index)).toBe(row.encodePick({ type: 'structure', id: p.id }));
    });
    expect(labels[1]).toMatchObject({ style: 'void', fadeKey: 'void', subjectRadiusMpc: 30 });
    expect(labels[2]).toMatchObject({ style: 'galaxyCluster', subjectRadiusMpc: 5 });
  });
});
