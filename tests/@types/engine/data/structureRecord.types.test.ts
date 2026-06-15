// tests/@types/engine/data/structureRecord.types.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type { StructureRecord } from '../../../../src/@types/data/structure/StructureRecord';
import type { StructureCategory } from '../../../../src/@types/data/structure/StructureCategory';
import type { StructureGroupId } from '../../../../src/@types/data/structure/StructureGroupId';

describe('StructureRecord types', () => {
  it('a cluster record carries abell + radius and a structure category', () => {
    const rec: StructureRecord = {
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
    const rec: StructureRecord = {
      id: 'local-group',
      name: 'Local Group',
      worldPos: [0, 0, 0],
      category: 'group',
      featured: true,
      physicalRadiusMpc: 1.5,
    };
    expectTypeOf(rec.category).toExtend<StructureCategory>();
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
