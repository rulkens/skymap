import { describe, it, expect } from 'vitest';
import { bodyTextureFilename } from '../../../src/utils/scene/bodyTextureFilename';

describe('bodyTextureFilename', () => {
  it('leaves the surface kind unsegmented', () => {
    // The byte-identical-to-today contract: surface names carry NO kind segment,
    // so the build re-emits the existing deployed filenames verbatim and Prep 1
    // needs no rebuild / re-sync. px is hand-computed from the small=2048 /
    // large=8192 ladder.
    expect(bodyTextureFilename('mars', 'surface', 'small')).toBe('mars-2048.jpg');
    expect(bodyTextureFilename('earth', 'surface', 'large')).toBe('earth-8192.jpg');
  });

  it('segments a non-surface kind', () => {
    // Future feature-map naming — no such map ships in Prep 1, but the branch is
    // exercised so the segment convention is pinned.
    expect(bodyTextureFilename('earth', 'night', 'large')).toBe('earth-night-8192.jpg');
  });

  it('uses PNG for the ring strip', () => {
    expect(bodyTextureFilename('saturn-ring', 'surface', 'large')).toBe('saturn-ring-8192.png');
  });
});
