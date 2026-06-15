// tests/@types/engine/data/structureRecord.types.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { StructureCategory } from '../../../../src/@types/data/structure/StructureCategory';
import type { StructureGroupId } from '../../../../src/@types/data/structure/StructureGroupId';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';

describe('StructureInfo types', () => {
  it('a cluster record carries abell + radius and a structure category', () => {
    const rec: StructureInfo = {
      type: 'structure',
      id: 'A1656',
      name: 'Coma',
      worldPos: [0, 0, 0],
      category: 'cluster',
      featured: true,
      physicalRadiusMpc: 2,
      abell: 'A1656',
    };
    expectTypeOf(rec.category).toExtend<StructureCategory>();
  });
  it('a group record carries radius and a structure category', () => {
    const rec: StructureInfo = {
      type: 'structure',
      id: 'local-group',
      name: 'Local Group',
      worldPos: [0, 0, 0],
      category: 'group',
      featured: true,
      physicalRadiusMpc: 1.5,
    };
    expectTypeOf(rec.category).toExtend<StructureCategory>();
  });
  it('the focusable-union tag is the SOURCE_REGISTRY type, distinct from category', () => {
    // `type` is the FocusableTarget discriminant; every structure arm pins it
    // to 'structure', while a galaxy pins it to 'galaxyCatalog'.
    expectTypeOf<StructureInfo['type']>().toEqualTypeOf<'structure'>();
    expectTypeOf<GalaxyInfo['type']>().toEqualTypeOf<'galaxyCatalog'>();
  });
  it('StructureCategory excludes famousGalaxy', () => {
    expectTypeOf<StructureCategory>().toEqualTypeOf<
      'cluster' | 'supercluster' | 'void' | 'group'
    >();
  });
  it('StructureGroupId is anchors | bulk', () => {
    expectTypeOf<StructureGroupId>().toEqualTypeOf<'anchors' | 'bulk'>();
  });
});
