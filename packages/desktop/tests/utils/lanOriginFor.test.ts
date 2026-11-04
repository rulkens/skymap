import { describe, expect, it } from 'vitest';
import { lanOriginFor } from '../../src/utils/lanOriginFor';

const wifi = { name: 'en0', address: '192.168.1.20' };
const ethernet = { name: 'en7', address: '10.0.0.5' };

describe('lanOriginFor', () => {
  it('uses the picked interface', () => {
    expect(lanOriginFor('en7', [wifi, ethernet], 47823)).toBe('https://10.0.0.5:47823');
  });

  it('falls back to the first interface when the picked one is gone', () => {
    expect(lanOriginFor('en7', [wifi], 47823)).toBe('https://192.168.1.20:47823');
    expect(lanOriginFor(null, [wifi, ethernet], 47823)).toBe('https://192.168.1.20:47823');
  });

  it('falls back to localhost with no interfaces', () => {
    expect(lanOriginFor('en0', [], 47823)).toBe('https://localhost:47823');
  });
});
