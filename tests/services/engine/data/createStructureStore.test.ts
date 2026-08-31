import { describe, it, expect } from 'vitest';
import { createStructureStore } from '../../../../src/services/engine/data/createStructureStore';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { StructureId } from '../../../../src/@types/data/structure/StructureId';

// StructureInfo is a discriminated union; a union-typed `category` can't be
// narrowed to a single arm at construction, so the helper asserts the type.
// The object is a structurally-valid record regardless of which arm.
const rec = (id: string, category: StructureId = 'cluster'): StructureInfo =>
  ({
    id,
    name: id,
    worldPos: [0, 0, 0],
    category,
    featured: true,
    physicalRadiusMpc: 1,
  }) as StructureInfo;

describe('createStructureStore', () => {
  it('all() concatenates anchors before bulk, preserving within-group order', () => {
    const s = createStructureStore();
    s.setGroup('bulk', [rec('b1'), rec('b2')]);
    s.setGroup('anchors', [rec('a1')]);
    expect(s.all().map((r) => r.id)).toEqual(['a1', 'b1', 'b2']);
  });

  it('setGroup replaces only its own group', () => {
    const s = createStructureStore();
    s.setGroup('anchors', [rec('a1')]);
    s.setGroup('bulk', [rec('b1')]);
    s.setGroup('anchors', [rec('a2')]);
    expect(s.all().map((r) => r.id)).toEqual(['a2', 'b1']);
  });

  it('clearGroup drops only its group', () => {
    const s = createStructureStore();
    s.setGroup('anchors', [rec('a1')]);
    s.setGroup('bulk', [rec('b1')]);
    s.clearGroup('bulk');
    expect(s.all().map((r) => r.id)).toEqual(['a1']);
  });

  it('byId and byCategory resolve across groups in all() order', () => {
    const s = createStructureStore();
    s.setGroup('anchors', [rec('a1', 'cluster')]);
    s.setGroup('bulk', [rec('b1', 'cluster'), rec('v1', 'void')]);
    expect(s.byId('b1')?.id).toBe('b1');
    expect(s.byId('nope')).toBeNull();
    expect(s.byCategory('cluster').map((r) => r.id)).toEqual(['a1', 'b1']);
  });

  it('categoryIndexOf matches the position byCategory would resolve back through', () => {
    // Interleaved categories with a gap: a global or all()-position counter
    // would each land on a different number here than the true per-category
    // position, exactly the drift `resolveStructureFromPick` can't tolerate.
    const s = createStructureStore();
    s.setGroup('anchors', [rec('c1', 'cluster'), rec('s1', 'supercluster'), rec('c2', 'cluster')]);
    expect(s.categoryIndexOf('cluster', 'c1')).toBe(0);
    expect(s.categoryIndexOf('supercluster', 's1')).toBe(0);
    expect(s.categoryIndexOf('cluster', 'c2')).toBe(1);
    expect(s.categoryIndexOf('cluster', 'nope')).toBe(-1);
  });

  it('setGroup takes a defensive copy (caller may mutate after)', () => {
    const s = createStructureStore();
    const arr = [rec('a1')];
    s.setGroup('anchors', arr);
    arr.push(rec('a2'));
    expect(s.all().map((r) => r.id)).toEqual(['a1']);
  });
});
