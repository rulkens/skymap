import { describe, expect, it } from 'vitest';
import type { StructureId } from '../../../../../src/@types/data/structure/StructureId';
import { LABEL_STYLES } from '../../../../../src/data/labels/labelStyles';
import { STRUCTURE_LABEL_STYLES } from '../../../../../src/layers/structure/markers/data/structureLabelStyles';
import { STRUCTURE_MARKER_STYLES } from '../../../../../src/layers/structure/markers/present/structureMarkerStyles';
import { structureApparentRadiusFade } from '../../../../../src/layers/structure/markers/present/structureApparentRadiusFade';
import { subjectSizeFade } from '../../../../../src/utils/labels/subjectSizeFade';

// Core cannot import Layer constants, so the label's appear band and the ring's threshold are
// two tables; this is the only thing keeping them one rule.
const CATEGORIES = Object.keys(STRUCTURE_LABEL_STYLES) as StructureId[];

describe.each([1, 2, 3])('structure ring and label at dpr %i', (dpr) => {
  it.each(CATEGORIES)('%s: a ring and its name fade in together', (category) => {
    const ring = STRUCTURE_MARKER_STYLES[category];
    const label = LABEL_STYLES[STRUCTURE_LABEL_STYLES[category]];
    const from = ring.markerMinApparentRadiusPx * dpr;
    const band = ring.markerMinApparentFadeBandPx * dpr;
    for (const radiusPx of [from, from + band * 0.25, from + band * 0.5, from + band * 2]) {
      expect(structureApparentRadiusFade(ring, radiusPx, dpr)).toBeCloseTo(
        subjectSizeFade(label, 2 * radiusPx, 1e9, dpr),
        12,
      );
    }
  });
});
