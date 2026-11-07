import { describe, expect, it } from 'vitest';
import { tabletSetupUrl } from '../../../../src/control/pairing/utils/tabletSetupUrl';

describe('tabletSetupUrl', () => {
  // The code rides in the fragment, which a browser never sends, so plain HTTP does not carry it.
  it('is the pairing host on the plain setup port, with the code after #', () => {
    expect(tabletSetupUrl('https://192.168.1.20:47823', 'K7Q2M9XP')).toBe(
      'http://192.168.1.20:47824/#K7Q2M9XP',
    );
  });
});
