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

  it('parseLayerSwitches expands a bare label into every caption entry, left to right', () => {
    const { switches, unknown } = parseLayerSwitches('-label,label:body');
    const captions = switches.slice(0, -1);
    expect(captions.length).toBeGreaterThan(1);
    expect(captions.every((s) => s.address.startsWith('label:') && !s.on)).toBe(true);
    expect(switches.at(-1)).toEqual({ address: 'label:body', on: true });
    expect(unknown).toEqual([]);
    expect(parseLayerSwitches('label:').unknown).toEqual(['label:']);
  });
});
