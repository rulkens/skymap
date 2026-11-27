/**
 * Row kinds that compose or delay other effects. A group's Value is empty (a folded one shows its
 * members' icons, from buildTimeline) and its families are the union of its children's, which reads
 * the registry back: `createStructureKinds` takes it as a thunk instead of importing it, which keeps
 * `rowKinds.ts` the one place the registry is assembled and avoids an import cycle.
 */
import { blendOf } from '../utils/blendOf';
import { CHANNEL_FAMILY_LEGEND } from '../../data/channelFamilies';
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
    registry()[e.kind] as unknown as { writes: (subject: Effect) => readonly ChannelFamily[] };
  const union = (children: readonly Effect[]): readonly ChannelFamily[] => {
    const written = new Set(children.flatMap((c) => spec(c).writes(c)));
    return CHANNEL_FAMILY_LEGEND.map((entry) => entry.family).filter((f) => written.has(f));
  };

  return {
    hold: {
      glyph: 'hold',
      mark: 'gap',
      fromView: null,
      writes: () => [],
      label: () => ({ name: 'Hold', op: '', value: '' }),
      fields: [{ key: 'sec', param: 'sec', label: 'Duration', control: 'seconds' }],
    },
    wait: {
      glyph: 'wait',
      mark: 'gap',
      fromView: null,
      writes: () => [],
      label: () => ({ name: 'Wait', op: '', value: '' }),
      fields: [{ key: 'sec', param: 'sec', label: 'Duration', control: 'seconds' }],
    },
    seq: {
      glyph: 'seq',
      mark: 'group',
      fromView: null,
      writes: (s) => union(s.children),
      label: (s) => {
        const blend = blendOf(s.overlap);
        return {
          name: 'Sequence',
          op: '',
          value: '',
          ...(blend > 0 ? { qualifier: `blend ${formatQuantity(blend, 's')}` } : {}),
        };
      },
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
      fromView: null,
      writes: (s) => union(s.children),
      label: () => ({ name: 'All', op: '', value: '' }),
      fields: [],
    },
    fork: {
      glyph: 'fork',
      mark: 'group',
      fromView: null,
      writes: (s) => union([s.child]),
      label: () => ({ name: 'Fork', op: '', value: '' }),
      fields: [],
    },
  };
}
