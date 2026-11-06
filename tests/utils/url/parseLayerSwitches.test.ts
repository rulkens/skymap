import { describe, it, expect } from 'vitest';

import { parseLayerSwitches } from '../../../src/utils/url/parseLayerSwitches';

describe('parseLayerSwitches', () => {
  it('parseLayerSwitches reads on, off, scoped and caption tokens in order', () => {
    expect(
      parseLayerSwitches(
        'flow,-starCatalog,survey:desiWedge,-label:structure,label:blackHole:sgr-a-star',
      ),
    ).toEqual({
      switches: [
        { address: 'flow', on: true },
        { address: 'starCatalog', on: false },
        { address: 'survey:desiWedge', on: true },
        { address: 'label:structure', on: false },
        { address: 'label:blackHole:sgr-a-star', on: true },
      ],
      unknown: [],
    });
  });

  it('parseLayerSwitches drops unknown names and unknown items, keeping the rest', () => {
    // `survey:desiWedge:x` splits to a known item; only its exact form is admitted.
    expect(parseLayerSwitches('flow,nope,survey:nope,,-label:nope,survey:desiWedge:x')).toEqual({
      switches: [{ address: 'flow', on: true }],
      unknown: ['nope', 'survey:nope', '-label:nope', 'survey:desiWedge:x'],
    });
  });
});
