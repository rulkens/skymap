/**
 * `bodyHostId` reads a different field per driver arm, so one real row per arm
 * is what catches an arm wired to the wrong one. The `surfaceFixed` arm has no
 * row until the sites land, and is covered by their own traverse test.
 */

import { describe, expect, it } from 'vitest';

import { bodyHostId } from '../../../src/data/bodies/positionDrivers';

describe('bodyHostId', () => {
  it('answers per driver kind', () => {
    expect(bodyHostId('moon')).toBe('earth');
    expect(bodyHostId('earth')).toBe('sun');
    expect(bodyHostId('sun')).toBeNull();
  });
});
