/**
 * armFadeEnvelope — pins the one property `armTaperEndFrac` exists for: it
 * moves where the arm goes dark. Every tier bounds its placement by
 * `armSpanEnd`, so an envelope that kept tapering to `fadeRadius` while the
 * samplers ran past it would leave the knob visibly inert at one end and
 * place unlit blobs at the other.
 */
import { describe, expect, it } from 'vitest';
import { armFadeEnvelope, armSpanEnd } from '../../../src/data/galaxy/armRidgeGeometry';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../src/data/galaxy/galaxyFieldMixture';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../src/data/milkyWay/milkyWayGalaxyParams';
import { carveStarLayout } from '../../../src/services/gpu/galaxy/carveStarLayout';
import { classifyHubbleType } from '../../../src/services/gpu/galaxy/classifyHubbleType';
import { packGenerationUniforms } from '../../../src/services/gpu/galaxy/packGenerationUniforms';
import { readGalaxyFieldGeometry } from '../../../src/services/gpu/galaxy/readGalaxyFieldGeometry';
import { splitStarBudget } from '../../../src/services/gpu/galaxy/splitStarBudget';

const params = MILKY_WAY_GALAXY_PARAMS;
const category = classifyHubbleType(params.type);
const budget = splitStarBudget(category, params);
const geometry = readGalaxyFieldGeometry(
  packGenerationUniforms(params, budget, null),
  carveStarLayout(category, params, budget),
);

const tuningWithEnd = (armTaperEndFrac: number) => ({
  ...DEFAULT_GALAXY_FIELD_TUNING,
  armTaperEndFrac,
});

describe('armFadeEnvelope', () => {
  it('goes dark at armSpanEnd, which armTaperEndFrac moves', () => {
    const arm = geometry.arms[0]!;
    const stock = tuningWithEnd(1);
    const trailing = tuningWithEnd(1.4);

    // 1.2 * fadeRadius: past the stock arm entirely, comfortably inside the
    // trailing one — so this pair cannot pass by both knobs behaving alike.
    const past = arm.fadeRadius * 1.2;
    expect(armFadeEnvelope(past, geometry, arm, stock)).toBe(0);
    expect(armFadeEnvelope(past, geometry, arm, trailing)).toBeGreaterThan(0);

    expect(armSpanEnd(arm, trailing)).toBeCloseTo(arm.fadeRadius * 1.4, 9);
    expect(armFadeEnvelope(armSpanEnd(arm, trailing) * 1.01, geometry, arm, trailing)).toBe(0);
  });
});
