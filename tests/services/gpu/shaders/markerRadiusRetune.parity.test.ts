/**
 * Parity guard: `MARKER_RADIUS_RETUNE` is authored in `structureMarker/io.wesl`
 * (the ring quad's world radius) and mirrored in TS for label placement above
 * the ring. `?static` linking injects no values, so a test keeps the two in step.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MARKER_RADIUS_RETUNE } from '../../../../src/data/markerRadiusRetune';

describe('structureMarker/io.wesl ↔ markerRadiusRetune.ts parity', () => {
  it('the shader factor matches the TS mirror', () => {
    const path = join(process.cwd(), 'src/services/gpu/shaders/structureMarker/io.wesl');
    const match = /const\s+MARKER_RADIUS_RETUNE\s*:\s*f32\s*=\s*([0-9.]+)/.exec(
      readFileSync(path, 'utf-8'),
    );
    expect(match, 'MARKER_RADIUS_RETUNE not found in io.wesl').not.toBeNull();
    expect(parseFloat(match![1]!)).toBe(MARKER_RADIUS_RETUNE);
  });
});
