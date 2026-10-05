import { describe, expect, it } from 'vitest';

import { packMaskPolygon } from '../../../../tools/scene-workbench/src/render/packMaskPolygon';

describe('packMaskPolygon', () => {
  it('packMaskPolygon writes count at byte 0 and corner k at 8 + 8k', () => {
    const bytes = packMaskPolygon([
      [1.5, -2],
      [3, 4],
      [-5, 6.25],
    ]);
    const view = new DataView(bytes);
    expect(bytes.byteLength).toBe(32);
    expect(view.getUint32(0, true)).toBe(3);
    expect([8, 12, 16, 20, 24, 28].map((off) => view.getFloat32(off, true))).toEqual([
      1.5, -2, 3, 4, -5, 6.25,
    ]);
  });

  it('packMaskPolygon of null is a 16-byte zero-count buffer', () => {
    const bytes = packMaskPolygon(null);
    expect(bytes.byteLength).toBe(16);
    expect(new DataView(bytes).getUint32(0, true)).toBe(0);
  });
});
