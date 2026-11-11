import { describe, expect, it } from 'vitest';

import { planFieldFrame } from '../../../../../../src/layers/milkyWay/field/host/utils/planFieldFrame';
import { APP_FIELD_TARGET_IDS } from '../../../../../../src/layers/milkyWay/field/data/appFieldTargetIds';
import { FIELD_TARGET_IDS } from '../../../../../../src/layers/milkyWay/field/data/fieldTargetIds';

const segment = (label: string, count = 3) => ({ label, first: 10, count });

describe('planFieldFrame', () => {
  it('encodes dustMap and field first, then each id with components, in FIELD_TARGET_IDS order', () => {
    const plan = planFieldFrame([segment('hii:extras'), segment('hii:young')], FIELD_TARGET_IDS);
    expect(plan.encodes).toEqual(['dustMap', 'field', 'young', 'extras']);
  });

  it('composites are the encodes minus the dust map, in the same order', () => {
    const plan = planFieldFrame([segment('hii:dig'), segment('hii:shells')], FIELD_TARGET_IDS);
    expect(plan.composites).toEqual(['field', 'shells', 'dig']);
  });

  it('a tier with no components is in neither list', () => {
    const plan = planFieldFrame([segment('hii:shells', 0)], FIELD_TARGET_IDS);
    expect(plan.encodes).not.toContain('shells');
    expect(plan.composites).not.toContain('shells');
  });

  // A planned id without a target would throw at encode (`fieldTargetOf`).
  it('plans no target the host was not given, even with components', () => {
    const plan = planFieldFrame([segment('hii:extras')], APP_FIELD_TARGET_IDS);
    expect(plan.encodes).toEqual(['dustMap', 'field']);
  });
});
