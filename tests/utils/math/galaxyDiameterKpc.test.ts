import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GALAXY_DIAMETER_KPC,
  galaxyDiameterKpc,
} from '../../../src/utils/math/galaxyDiameterKpc';

describe('galaxyDiameterKpc', () => {
  it('returns DEFAULT_GALAXY_DIAMETER_KPC when no magnitude supplied', () => {
    expect(galaxyDiameterKpc({})).toBe(DEFAULT_GALAXY_DIAMETER_KPC);
  });

  it('DEFAULT_GALAXY_DIAMETER_KPC equals 30 (Milky-Way placeholder)', () => {
    expect(DEFAULT_GALAXY_DIAMETER_KPC).toBe(30);
  });

  it('returns DEFAULT for NaN magnitude (defensive)', () => {
    expect(galaxyDiameterKpc({ absMagBmag: NaN })).toBe(DEFAULT_GALAXY_DIAMETER_KPC);
  });
});
