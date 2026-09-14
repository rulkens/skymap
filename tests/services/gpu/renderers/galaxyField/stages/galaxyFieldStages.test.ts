/**
 * `createStageGraph` rejects a forward after-edge, an unknown one, and a sync
 * row depending on a step row — but only at construction, and nothing in the
 * suite constructs the real table without a GPU device. This does.
 */
import { describe, expect, it } from 'vitest';

import { GALAXY_FIELD_STAGES } from '../../../../../../src/services/gpu/renderers/galaxyField/stages/galaxyFieldStages';
import { createStageGraph } from '../../../../../../src/services/gpu/lib/createStageGraph';

describe('GALAXY_FIELD_STAGES', () => {
  it('satisfies createStageGraph’s after-edge validation', () => {
    expect(() => createStageGraph(GALAXY_FIELD_STAGES)).not.toThrow();
  });

  it('names every row exactly once', () => {
    const names = GALAXY_FIELD_STAGES.map((stage) => stage.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
