/**
 * Row kinds that change the scene, not the camera: layer visibility, settings, focus and the
 * orientation frame. Visibility rows list their addresses in the Value (`flow, labels +1`); a fade
 * puts the addresses in its qualifier so the Value stays the level (`→ 0 %`).
 */
import { describeSettingsAction } from '../utils/describeSettingsAction';
import { easeField } from '../utils/fields/easeField';
import { formatAddresses } from '../utils/formatAddresses';
import { overField } from '../utils/fields/overField';
import { readoutField } from '../utils/fields/readoutField';
import { formatQuantity } from '../../utils/format/formatQuantity';
import type { RowKindRegistry } from '../../@types/kinds/RowKindRegistry';

const LAYER_ITEMS_FIELD = {
  key: 'args',
  param: 'args',
  label: 'Layers',
  control: 'layerItems',
} as const;

export const sceneKinds: Pick<
  RowKindRegistry,
  'show' | 'hide' | 'fade' | 'scene' | 'focus' | 'frameTo'
> = {
  show: {
    glyph: 'show',
    mark: 'cue',
    fromView: null,
    writes: () => ['layers'],
    label: (s) => ({ name: 'Show', op: '', value: formatAddresses(s.args) }),
    fields: [LAYER_ITEMS_FIELD, overField('Fade in', { fallback: 0 })],
  },
  hide: {
    glyph: 'hide',
    mark: 'cue',
    fromView: null,
    writes: () => ['layers'],
    label: (s) => ({ name: 'Hide', op: '', value: formatAddresses(s.args) }),
    fields: [LAYER_ITEMS_FIELD, overField('Fade out', { fallback: 0 })],
  },
  fade: {
    glyph: 'fade',
    mark: 'bar',
    fromView: null,
    writes: () => ['layers'],
    label: (s) => ({
      name: 'Fade',
      op: '→',
      value: formatQuantity(s.to * 100, '%'),
      qualifier: formatAddresses(s.args),
    }),
    fields: [
      { key: 'args', param: 'args', label: 'Layers', control: 'layers' },
      { key: 'to', param: 'to', label: 'Level', control: 'percent' },
      overField(),
    ],
  },
  scene: {
    glyph: 'set',
    mark: 'cue',
    fromView: null,
    writes: () => ['settings'],
    label: (s) => ({ name: 'Set', op: '', value: describeSettingsAction(s.action) }),
    fields: [{ key: 'action', param: 'action', label: 'Setting', control: 'settingsAction' }],
  },
  focus: {
    glyph: 'focus',
    mark: 'cue',
    fromView: null,
    writes: () => ['settings'],
    label: (s) =>
      s.ref === null
        ? { name: 'Focus', op: '', value: 'none' }
        : { name: 'Focus', op: '', value: '', subject: s.ref },
    fields: [{ key: 'ref', param: 'ref', label: 'Subject', control: 'focusRef' }],
  },
  frameTo: {
    glyph: 'frame',
    mark: 'bar',
    fromView: null,
    writes: () => ['settings'],
    label: (s) => ({ name: 'Frame', op: '→', value: s.frame }),
    fields: [readoutField('frame', 'Frame'), overField(), easeField()],
  },
};
