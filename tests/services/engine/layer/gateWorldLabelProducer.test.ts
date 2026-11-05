import { describe, expect, it } from 'vitest';

import { gateWorldLabelProducer } from '../../../../src/services/engine/layer/gateWorldLabelProducer';

describe('gateWorldLabelProducer', () => {
  // `runLabel3DProducers` recedes a world label by this entry, and its own test builds the
  // producer by hand: this is the one pin that the gate does not drop it.
  it("the gated world producer keeps its row's label", () => {
    const produceLabels3D = () => ({ labels: [], awake: false });
    expect(
      gateWorldLabelProducer({ id: 'c', label: 'constellations', produceLabels3D }).label,
    ).toBe('constellations');
  });
});
