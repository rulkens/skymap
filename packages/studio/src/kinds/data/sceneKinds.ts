/**
 * Row kinds that change the scene, not the camera: layer visibility, settings, focus and the
 * orientation frame. Visibility rows list their addresses in the Value (`flow, labels +1`); a fade
 * puts the addresses in its qualifier so the Value stays the level (`→ 0 %`).
 */
import { formatSelectionRef } from '../utils/formatSelectionRef';
import { formatNameList } from '../../utils/format/formatNameList';
import { formatQuantity } from '../../utils/format/formatQuantity';
import { easeField, overField, readoutField } from './commonFields';
import { setFlow, setFlowEnabled } from '../../../../../src/layers/flow/state/flow/slice';
import { setGalaxyCatalogVisible } from '../../../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import { setLabelsFocusedOnly } from '../../../../../src/state/settings/core/labelsSlice';
import type { SettingsAction } from '../../../../../src/compositions/@types/SettingsAction';
import type { RowKindRegistry } from '../../@types/kinds/RowKindRegistry';

/** `flow`, `clusters labels` for `label:clusters`, and the bare item for a scoped address. */
const formatAddress = (address: string): string => {
  const parts = address.split(':');
  if (parts[0] === 'label') return parts[2] ?? `${parts[1]} labels`;
  return parts[1] ?? address;
};

const formatAddresses = (args: readonly string[]): string =>
  formatNameList(args.map(formatAddress));

const describeSettingsAction = (action: SettingsAction): string => {
  if (setFlowEnabled.match(action)) return `flow ${action.payload ? 'on' : 'off'}`;
  if (setFlow.match(action)) return 'flow tuned';
  if (setGalaxyCatalogVisible.match(action)) {
    return `${action.payload.id} ${action.payload.enabled ? 'on' : 'off'}`;
  }
  return setLabelsFocusedOnly.match(action) && action.payload ? 'labels focused' : 'labels all';
};

export const sceneKinds: Pick<
  RowKindRegistry,
  'show' | 'hide' | 'fade' | 'scene' | 'focus' | 'frameTo'
> = {
  show: {
    glyph: 'show',
    mark: 'cue',
    writes: () => ['layers'],
    label: (s) => ({ name: 'Show', op: '', value: formatAddresses(s.args) }),
    fields: [readoutField('args', 'Layers'), overField('Fade in')],
  },
  hide: {
    glyph: 'hide',
    mark: 'cue',
    writes: () => ['layers'],
    label: (s) => ({ name: 'Hide', op: '', value: formatAddresses(s.args) }),
    fields: [readoutField('args', 'Layers'), overField('Fade out')],
  },
  fade: {
    glyph: 'fade',
    mark: 'bar',
    writes: () => ['layers'],
    label: (s) => ({
      name: 'Fade',
      op: '→',
      value: formatQuantity(s.to * 100, '%'),
      qualifier: formatAddresses(s.args),
    }),
    fields: [
      readoutField('args', 'Layers'),
      { key: 'to', param: 'to', label: 'Level', control: 'percent' },
      overField(),
    ],
  },
  scene: {
    glyph: 'set',
    mark: 'cue',
    writes: () => ['settings'],
    label: (s) => ({ name: 'Set', op: '', value: describeSettingsAction(s.action) }),
    fields: [readoutField('action', 'Setting')],
  },
  focus: {
    glyph: 'focus',
    mark: 'cue',
    writes: () => ['settings'],
    label: (s) => ({ name: 'Focus', op: '', value: formatSelectionRef(s.ref) }),
    fields: [readoutField('ref', 'Subject')],
  },
  frameTo: {
    glyph: 'frame',
    mark: 'bar',
    writes: () => ['settings'],
    label: (s) => ({ name: 'Frame', op: '→', value: s.frame }),
    fields: [readoutField('frame', 'Frame'), overField(), easeField()],
  },
};
