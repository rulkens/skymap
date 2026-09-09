/**
 * DIG's span is a reservation EMBEDDED between shells and young, not a tail —
 * `place:dig` dispatches at the `hii:dig` segment's own `first`, so an offset
 * that disagrees with the zero block silently overwrites young stars.
 */
import { describe, expect, it } from 'vitest';

import { packHiiSlices } from '../../../../../../src/services/gpu/renderers/galaxyField/field/packHiiSlices';
import { FIELD_COMPONENT_FLOATS } from '../../../../../../src/services/gpu/renderers/galaxyField/field/packFieldUniforms';
import type { GalaxyFieldComponent } from '../../../../../../src/@types/galaxy/GalaxyFieldComponent';
import type { HiiShellsAndYoungResult } from '../../../../../../src/services/engine/galaxyGenerator/v2/hiiRegions';

const component = (amplitude: number): GalaxyFieldComponent => ({
  amplitude,
  invCovDiagonal: [1, 1, 1],
  invCovOffDiagonal: [0, 0, 0],
  color: [1, 1, 1],
  center: [0, 0, 0],
  boundRadius: 1,
});

// Two shells then three young — the split the `hii:shells` segment declares,
// which is the only part of `segments` this pack reads.
const HII: HiiShellsAndYoungResult = {
  components: [component(1), component(2), component(3), component(4), component(5)],
  segments: [
    { label: 'hii:shells', first: 0, count: 2 },
    { label: 'hii:young', first: 2, count: 3 },
  ],
  shellFluxSum: 0,
  recentEventCount: 0,
};

const totalRecords = (segments: readonly { readonly count: number }[]): number =>
  segments.reduce((sum, s) => sum + s.count, 0);

describe('packHiiSlices', () => {
  it('embeds the DIG reservation between shells and young', () => {
    const digCount = 4;
    const { packed, segments } = packHiiSlices(HII, [], digCount);
    expect(segments).toEqual([
      { label: 'hii:shells', first: 0, count: 2 },
      { label: 'hii:dig', first: 2, count: digCount },
      { label: 'hii:young', first: 6, count: 3 },
    ]);
    // Amplitude is [4i+0].w: the two shells, then a zero DIG block, then young.
    const amplitudeAt = (record: number) => packed[record * FIELD_COMPONENT_FLOATS + 3];
    expect(amplitudeAt(1)).toBe(2);
    expect(amplitudeAt(2)).toBe(0);
    expect(amplitudeAt(5)).toBe(0);
    expect(amplitudeAt(6)).toBe(3);
  });

  it('omits the extras segment when there are no extras', () => {
    const { segments } = packHiiSlices(HII, [], 0);
    expect(segments.map((s) => s.label)).toEqual(['hii:shells', 'hii:dig', 'hii:young']);
  });

  it('appends every extra after young, with the packed length covering all four segments', () => {
    const extras = [[component(10)], [component(11), component(12)]];
    const { packed, segments } = packHiiSlices(HII, extras, 4);
    expect(segments[3]).toEqual({ label: 'hii:extras', first: 9, count: 3 });
    expect(packed).toHaveLength(totalRecords(segments) * FIELD_COMPONENT_FLOATS);
  });
});
