import { describe, it, expect } from 'vitest';
import type { EngineCameraHandle } from '../../../src/@types/engine/handles/EngineCameraHandle';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

describe('EngineCameraHandle.focusOn (structure)', () => {
  it('accepts a StructureInfo via the unified focusOn slot', () => {
    // Type-level assertion: the unified focusOn signature accepts both
    // GalaxyInfo and StructureInfo (see FocusableTarget).  This test
    // pins the structure half of that contract; the galaxy half is implicit
    // in every existing handle consumer.
    const structure: StructureInfo = {
      type: 'structure',
      id: 'virgo-cluster',
      name: 'Virgo Cluster',
      category: 'cluster',
      worldPos: [0, 0, 0],
      featured: true,
      physicalRadiusMpc: 2.2,
    };
    const _stub: Pick<EngineCameraHandle, 'focusOn'> = {
      focusOn: (target): void => void target,
    };
    _stub.focusOn(structure);
    expect(_stub.focusOn).toBeTypeOf('function');
  });
});
