/**
 * Row kinds that move the camera by value. Names follow the owner's naming table: the channel picks the
 * Name (Distance / Turn / Tilt …), the operator slot says how (`→` sets to, `+`/`−` adds, `±` swings).
 * set, spin, rate and osc span several channels, so they leave `glyph` out and the model uses the
 * icon of the row's channel family.
 */
import { CHANNEL_FAMILY } from '../../data/channelFamilies';
import { formatDegrees } from '../utils/formatDegrees';
import { formatVec3 } from '../utils/formatVec3';
import { formatNameList } from '../../utils/format/formatNameList';
import { formatNumber } from '../../utils/format/formatNumber';
import { formatQuantity } from '../../utils/format/formatQuantity';
import { easeField, overField, readoutField } from './commonFields';
import {
  DEFAULT_ALIGN_SEC,
  DEFAULT_LINGER,
  DEFAULT_LINGER_SEC,
  DEFAULT_RAMP_SEC,
} from '../../../../../src/services/engine/animation/pathDefaults';
import type { Channel } from '../../../../../src/@types/animation/Channel';
import type { FieldControl } from '../../@types/kinds/FieldControl';
import type { FieldSpec } from '../../@types/kinds/FieldSpec';
import type { RowKindRegistry } from '../../@types/kinds/RowKindRegistry';

const SET_NAME: Record<Channel, string> = {
  distance: 'Distance',
  yaw: 'Turn',
  pitch: 'Tilt',
  roll: 'Roll',
  fov: 'FOV',
  target: 'Look-at',
};
const RATE_NAME: Record<Channel, string> = {
  distance: 'Zoom speed',
  yaw: 'Turn speed',
  pitch: 'Tilt speed',
  roll: 'Roll speed',
  fov: 'FOV speed',
  target: 'Pan speed',
};
const BOB_NAME: Record<Channel, string> = {
  distance: 'Bob zoom',
  yaw: 'Bob turn',
  pitch: 'Bob tilt',
  roll: 'Bob roll',
  fov: 'Bob FOV',
  target: 'Bob pan',
};

/** A channel's scalar in the unit people read it in: Mpc for distance, degrees for angles. */
const channelValue = (ch: Channel, value: number): string =>
  ch === 'distance' ? formatQuantity(value, 'Mpc') : formatDegrees(value);

const channelControl = (ch: Channel): FieldControl =>
  ch === 'distance' ? 'mpc' : ch === 'target' ? 'number' : 'degrees';

const channelField = <T extends { readonly ch: Channel }>(): FieldSpec<T> => ({
  key: 'ch',
  param: 'ch' as FieldSpec<T>['param'],
  label: 'Channel',
  control: 'channel',
});

const toField = <T extends { readonly ch: Channel; readonly to: number }>(): FieldSpec<T> => ({
  key: 'to',
  param: 'to' as FieldSpec<T>['param'],
  label: 'Value',
  control: (s) => channelControl(s.ch),
});

const familyOf = (ch: Channel) => [CHANNEL_FAMILY[ch]] as const;

export const cameraKinds: Pick<
  RowKindRegistry,
  'set' | 'setVec' | 'spin' | 'rate' | 'osc' | 'aimAlong' | 'flyPath' | 'geodesic'
> = {
  set: {
    mark: 'bar',
    writes: (s) => familyOf(s.ch),
    label: (s) => ({ name: SET_NAME[s.ch], op: '→', value: channelValue(s.ch, s.to) }),
    fields: [channelField(), toField(), overField(), easeField()],
  },
  setVec: {
    glyph: 'look',
    mark: 'bar',
    writes: () => ['lookAt'],
    label: (s) => ({ name: 'Look-at', op: '→', value: formatVec3(s.to, 'Mpc') }),
    fields: [readoutField('to', 'Target'), overField(), easeField()],
  },
  spin: {
    mark: 'bar',
    writes: (s) => familyOf(s.ch),
    label: (s) => ({
      name: SET_NAME[s.ch],
      op: s.by < 0 ? '−' : '+',
      value: channelValue(s.ch, Math.abs(s.by)),
      ...(s.loop === true ? { qualifier: 'loops' } : {}),
    }),
    fields: [
      channelField(),
      {
        key: 'by',
        param: 'by',
        label: 'Amount',
        control: (s) => channelControl(s.ch),
      },
      overField(),
      easeField(),
      { key: 'loop', param: 'loop', label: 'Loop', control: 'toggle', fallback: false },
    ],
  },
  rate: {
    mark: 'rate',
    writes: (s) => familyOf(s.ch),
    label: (s) => ({
      name: RATE_NAME[s.ch],
      op: '→',
      value:
        s.ch === 'distance' || s.ch === 'target'
          ? `${formatNumber(s.to)}/s`
          : formatQuantity((s.to * 180) / Math.PI, '°/s'),
    }),
    fields: [
      channelField(),
      {
        key: 'to',
        param: 'to',
        label: 'Speed',
        control: (s) => (s.ch === 'distance' || s.ch === 'target' ? 'number' : 'degreesPerSec'),
      },
      overField(),
      easeField(),
    ],
  },
  osc: {
    mark: 'osc',
    writes: (s) => familyOf(s.ch),
    label: (s) => ({
      name: BOB_NAME[s.ch],
      op: '±',
      value: `${channelValue(s.ch, s.amp)} /${formatQuantity(s.period, 's')}`,
      ...(s.fade !== undefined && s.fade > 0
        ? { qualifier: `fade ${formatQuantity(s.fade, 's')}` }
        : {}),
    }),
    fields: [
      channelField(),
      { key: 'amp', param: 'amp', label: 'Swing', control: (s) => channelControl(s.ch) },
      { key: 'period', param: 'period', label: 'Period', control: 'seconds' },
      overField('Window'),
      { key: 'fade', param: 'fade', label: 'Fade', control: 'seconds', fallback: 0 },
      easeField(),
    ],
  },
  aimAlong: {
    glyph: 'aimAlong',
    mark: 'bar',
    writes: () => ['turn'],
    label: (s) => ({ name: 'Aim', op: '→', value: `along ${formatVec3(s.forward)}` }),
    fields: [readoutField('forward', 'Direction'), overField(), easeField()],
  },
  flyPath: {
    glyph: 'fly',
    mark: 'composite',
    // One composite writer over all four camera channels for its window.
    writes: () => ['distance', 'lookAt', 'turn'],
    label: (s) => ({
      name: 'Fly',
      op: '',
      value: `via ${formatNameList(s.waypoints.map((w, i) => ('id' in w ? w.id : `point ${i + 1}`)))}`,
    }),
    fields: [
      overField('Duration'),
      easeField(),
      {
        key: 'align',
        param: 'align',
        label: 'Align-in',
        control: 'seconds',
        fallback: DEFAULT_ALIGN_SEC,
      },
      {
        key: 'rampSec',
        param: 'rampSec',
        label: 'Ramp',
        control: 'seconds',
        fallback: DEFAULT_RAMP_SEC,
      },
      {
        key: 'linger',
        param: 'linger',
        label: 'Linger',
        control: 'percent',
        fallback: DEFAULT_LINGER,
      },
      {
        key: 'lingerSec',
        param: 'lingerSec',
        label: 'Linger for',
        control: 'seconds',
        fallback: DEFAULT_LINGER_SEC,
      },
      readoutField('spline', 'Spline'),
      readoutField('passBy', 'Pass by'),
    ],
  },
  geodesic: {
    glyph: 'dist',
    mark: 'composite',
    writes: () => ['distance', 'lookAt'],
    label: (s) => ({ name: 'Zoom-pan', op: '→', value: formatQuantity(s.to.distance, 'Mpc') }),
    fields: [
      readoutField('to', 'Destination'),
      overField(),
      readoutField('tuning', 'Tuning'),
      readoutField('fovYRad', 'FOV'),
    ],
  },
};
