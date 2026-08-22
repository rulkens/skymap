/**
 * Parity guard: `ATLAS_FONT_SIZE` (src/data/fonts.ts) is the one canonical
 * bake-time em size; `labels/vertex.wesl` and `labels3d/vertex.wesl` each
 * carry an unguarded `ATLAS_EM_PX` copy with only a must-match comment.
 * `?static` linking injects no values, so nothing else catches one shader
 * drifting from the TS source — same discipline as the sibling
 * `*.parity.test.ts` suites in this directory, using the LINKED-output
 * technique from `label3DRenderer.test.ts`'s WESL binding-parity test.
 */
import { describe, expect, it } from 'vitest';

import { ATLAS_FONT_SIZE } from '../../../../src/data/fonts';
import vertexLinked from '../../../../src/services/gpu/shaders/labels/vertex.wesl?static';
import vertex3dLinked from '../../../../src/services/gpu/shaders/labels3d/vertex.wesl?static';

const ATLAS_EM_PX_RE = /const\s+ATLAS_EM_PX\s*:\s*f32\s*=\s*([0-9]+(?:\.[0-9]+)?)/;

function extractAtlasEmPx(linkedSource: string, label: string): number {
  const match = ATLAS_EM_PX_RE.exec(linkedSource);
  expect(match, `ATLAS_EM_PX not found in ${label}`).not.toBeNull();
  return parseFloat(match![1]!);
}

describe('labels vertex shaders ↔ ATLAS_FONT_SIZE parity', () => {
  it('labels/vertex.wesl ATLAS_EM_PX matches ATLAS_FONT_SIZE', () => {
    expect(extractAtlasEmPx(vertexLinked, 'labels/vertex.wesl')).toBe(ATLAS_FONT_SIZE);
  });

  it('labels3d/vertex.wesl ATLAS_EM_PX matches ATLAS_FONT_SIZE', () => {
    expect(extractAtlasEmPx(vertex3dLinked, 'labels3d/vertex.wesl')).toBe(ATLAS_FONT_SIZE);
  });
});
