import { describe, expect, it } from 'vitest';
import { brickPartFiles } from '../../../../tools/volumes/utils/brickPartFiles';

describe('brickPartFiles', () => {
  it("picks one field+format's part packs, hashed or not, and nothing else", () => {
    const names = [
      'mcpm.r8.L0.p0.pack',
      'mcpm.r8.L0.p12.0a1b2c3d.pack',
      'mcpm.r8.L0.idx',
      'mcpm.r8.L1.bin',
      'mcpm.bc4.L0.p0.pack',
      'polyphorm-2mrs.r8.L0.p0.pack',
      'mcpm.json',
    ];
    expect(brickPartFiles(names, 'mcpm', 'r8')).toEqual([
      'mcpm.r8.L0.p0.pack',
      'mcpm.r8.L0.p12.0a1b2c3d.pack',
    ]);
  });
});
