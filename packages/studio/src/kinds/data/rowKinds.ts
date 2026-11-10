/**
 * ROW_KINDS: the one registry of what the studio knows about each row kind (A5). The mapped type over
 * every `Effect['kind']` plus the two pseudo-rows makes a missing kind a compile error. Adding a kind
 * is one entry in a family file. A waypoint is Pass, or Settle (label and glyph) when it is the last of its path.
 */
import { cameraKinds } from './cameraKinds';
import { sceneKinds } from './sceneKinds';
import { createStructureKinds } from './structureKinds';
import { subjectKinds } from './subjectKinds';
import { overField } from '../utils/fields/overField';
import { readoutField } from '../utils/fields/readoutField';
import { formatMpc } from '../../utils/format/formatMpc';
import type { RowKindRegistry } from '../../@types/kinds/RowKindRegistry';

export const ROW_KINDS: RowKindRegistry = {
  ...cameraKinds,
  ...subjectKinds,
  ...sceneKinds,
  ...createStructureKinds(() => ROW_KINDS),
  start: {
    glyph: 'start',
    mark: 'start',
    writes: () => ['distance', 'lookAt', 'turn'],
    label: (s) => ({
      name: 'Start',
      op: '',
      value: typeof s === 'object' ? 'saved view' : 'live view',
    }),
    fields: [
      { key: 'distance', param: 'distance', label: 'Distance', control: 'mpc' },
      { key: 'yaw', param: 'yaw', label: 'Turn', control: 'degrees' },
      { key: 'pitch', param: 'pitch', label: 'Tilt', control: 'degrees' },
      { key: 'target', param: 'target', label: 'Look-at', control: 'subjectPosition' },
    ],
  },
  waypoint: {
    glyph: (s) => (s.last ? 'settle' : 'pass'),
    mark: 'knot',
    writes: () => ['distance', 'lookAt', 'turn'],
    label: (s) => {
      const name = s.last ? 'Settle' : 'Pass';
      return 'id' in s
        ? { name, op: '→', value: '', subject: s.id }
        : { name, op: '→', value: formatMpc(s.distance) };
    },
    fields: [
      // `at` and `distance` exist only on a point waypoint; a subject waypoint leaves them out.
      readoutField('at', 'Position'),
      { key: 'distance', param: 'distance', label: 'Distance', control: 'mpc' },
      overField('Leg time', { optional: true }),
      { key: 'linger', param: 'linger', label: 'Linger', control: 'percent', optional: true },
      { key: 'yaw', param: 'yaw', label: 'Turn', control: 'degrees', optional: true },
      { key: 'pitch', param: 'pitch', label: 'Tilt', control: 'degrees', optional: true },
    ],
  },
};
