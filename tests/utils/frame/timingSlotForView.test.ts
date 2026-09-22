import { describe, it, expect } from 'vitest';
import { timingSlotForView } from '../../../src/utils/frame/timingSlotForView';

describe('timingSlotForView', () => {
  it('canvas gives the bare base', () => {
    expect(timingSlotForView('hdr·COSMO', 'canvas')).toBe('hdr·COSMO');
  });

  it('a capture face gets @key:face', () => {
    expect(timingSlotForView('hdr·COSMO', 'sgrAStar:3')).toBe('hdr·COSMO@sgrAStar:3');
  });
});
