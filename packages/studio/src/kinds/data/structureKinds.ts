/**
 * Row kinds that compose or delay other effects. A group's Value lists its children's Names plus the
 * join state (`Distance ×2 · blend 1 s`) and its families are the union of its children's, so both
 * read the registry back: `createStructureKinds` takes it as a thunk instead of importing it, which
 * keeps `rowKinds.ts` the one place the registry is assembled and avoids an import cycle.
 */
import { blendOf } from '../utils/blendOf';
import { foldRepeats } from '../utils/foldRepeats';
import { CHANNEL_FAMILY_LEGEND } from '../../data/channelFamilies';
import { formatNameList } from '../../utils/format/formatNameList';
import { formatQuantity } from '../../utils/format/formatQuantity';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { RowKindRegistry } from '../../@types/kinds/RowKindRegistry';
import type { ChannelFamily } from '../../@types/rows/ChannelFamily';

export function createStructureKinds(
  registry: () => RowKindRegistry,
): Pick<RowKindRegistry, 'hold' | 'wait' | 'seq' | 'all' | 'fork'> {
  // `registry()[e.kind]` is a union of specs over different subjects; indexing by the child's own
  // kind makes the subject match, which the compiler cannot follow.
  const spec = (e: Effect) =>
    registry()[e.kind] as unknown as {
      label: (subject: Effect) => { name: string };
      writes: (subject: Effect) => readonly ChannelFamily[];
    };
  const names = (children: readonly Effect[]) => children.map((c) => spec(c).label(c).name);
  const union = (children: readonly Effect[]): readonly ChannelFamily[] => {
    const written = new Set(children.flatMap((c) => spec(c).writes(c)));
    return CHANNEL_FAMILY_LEGEND.map((entry) => entry.family).filter((f) => written.has(f));
  };
  const groupValue = (children: readonly Effect[], blend = 0): string =>
    formatNameList(foldRepeats(names(children))) +
    (blend > 0 ? ` · blend ${formatQuantity(blend, 's')}` : '');

  return {
    hold: {
      glyph: 'hold',
      mark: 'gap',
      writes: () => [],
      label: () => ({ name: 'Hold', op: '', value: '' }),
      fields: [{ key: 'sec', param: 'sec', label: 'Duration', control: 'seconds' }],
    },
    wait: {
      glyph: 'wait',
      mark: 'gap',
      writes: () => [],
      label: () => ({ name: 'Wait', op: '', value: '' }),
      fields: [{ key: 'sec', param: 'sec', label: 'Duration', control: 'seconds' }],
    },
    seq: {
      glyph: 'seq',
      mark: 'group',
      writes: (s) => union(s.children),
      label: (s) => ({
        name: 'Sequence',
        op: '',
        value: groupValue(s.children, blendOf(s.overlap)),
      }),
      fields: [
        {
          key: 'overlap',
          param: 'overlap',
          label: 'Blend',
          control: (s) => (typeof s.overlap === 'object' ? 'readout' : 'seconds'),
          fallback: 0,
        },
      ],
    },
    all: {
      glyph: 'all',
      mark: 'group',
      writes: (s) => union(s.children),
      label: (s) => ({ name: 'All', op: '', value: groupValue(s.children) }),
      fields: [],
    },
    fork: {
      glyph: 'fork',
      mark: 'group',
      writes: (s) => union([s.child]),
      label: (s) => ({ name: 'Background', op: '', value: groupValue([s.child]) }),
      fields: [],
    },
  };
}
