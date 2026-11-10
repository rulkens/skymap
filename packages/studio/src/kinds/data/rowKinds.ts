/**
 * ROW_KINDS: the one registry of what the studio knows about each row kind (A5). The mapped type over
 * every `Effect['kind']` plus the two pseudo-rows makes a missing kind a compile error. Adding a kind
 * is one entry in a family file. A waypoint is labelled Pass here; `buildTimeline` renames the last
 * one Settle, since a subject cannot know its position in the path.
 */
import { cameraKinds } from './cameraKinds';
import { sceneKinds } from './sceneKinds';
import { createStructureKinds } from './structureKinds';
import { subjectKinds } from './subjectKinds';
import { overField, readoutField } from './commonFields';
import { formatQuantity } from '../../utils/format/formatQuantity';
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
      readoutField('target', 'Look-at'),
    ],
  },
  waypoint: {
    glyph: 'pass',
    mark: 'knot',
    writes: () => ['distance', 'lookAt', 'turn'],
    label: (s) =>
      'id' in s
        ? { name: 'Pass', op: '→', value: '', subject: s.id }
        : { name: 'Pass', op: '→', value: formatQuantity(s.distance, 'Mpc') },
    fields: [
      overField('Leg time'),
      { key: 'linger', param: 'linger', label: 'Linger', control: 'percent' },
      { key: 'yaw', param: 'yaw', label: 'Turn', control: 'degrees' },
      { key: 'pitch', param: 'pitch', label: 'Tilt', control: 'degrees' },
    ],
  },
};
