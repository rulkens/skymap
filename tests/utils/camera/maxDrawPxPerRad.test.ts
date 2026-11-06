import { describe, expect, it } from 'vitest';

import { maxDrawPxPerRad } from '../../../src/utils/camera/maxDrawPxPerRad';

const frame = (drawPxPerRad: number) => ({ drawPxPerRad, viewKind: 'frame' as const });
const capture = (drawPxPerRad: number) => ({ drawPxPerRad, viewKind: 'capture' as const });

describe('maxDrawPxPerRad', () => {
  it('captures never set the max', () => {
    expect(maxDrawPxPerRad([frame(935), capture(4096)])).toBe(935);
  });

  it('dome faces: the max of five', () => {
    const faces = [frame(512), frame(640), frame(512), frame(700), frame(512)];
    expect(maxDrawPxPerRad(faces)).toBe(700);
  });

  it('no drawing view gives 0', () => {
    expect(maxDrawPxPerRad([])).toBe(0);
    expect(maxDrawPxPerRad([capture(2048)])).toBe(0);
  });
});
