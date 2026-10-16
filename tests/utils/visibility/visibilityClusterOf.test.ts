import { describe, expect, it } from 'vitest';
import { visibilityClusterOf } from '../../../src/utils/visibility/visibilityClusterOf';

describe('visibilityClusterOf', () => {
  it("defaults a show entry to its key, and otherwise reads the entry's own cluster", () => {
    expect(visibilityClusterOf({ key: 'flow' })).toBe('flow');
    expect(visibilityClusterOf({ key: 'missionTrails', cluster: 'missions' })).toBe('missions');
    expect(visibilityClusterOf({ label: 'body', cluster: 'bodies' })).toBe('bodies');
  });
});
