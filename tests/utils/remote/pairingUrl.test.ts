import { describe, expect, it } from 'vitest';
import { pairingUrl } from '../../../src/utils/remote/pairingUrl';

describe('pairingUrl', () => {
  it('puts the code in the remote page hash', () => {
    expect(pairingUrl('https://10.0.0.2:5173', 'ABCD2345')).toBe(
      'https://10.0.0.2:5173/remote.html#ABCD2345',
    );
  });
});
