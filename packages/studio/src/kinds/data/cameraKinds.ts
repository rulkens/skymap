/**
 * Row kinds that move the camera by value. Names follow the owner's naming table: the channel picks the
 * Name (Distance / Turn / Tilt …), the operator slot says how (`→` sets to, `+`/`−` adds, `±` swings).
 * set, spin, rate and osc span several channels, so they leave `glyph` out and the model uses the
 * icon of the row's channel family.
 */
import { CHANNEL_NAME } from '../../data/channelNames';
import { channelControl } from '../utils/channelControl';
import { channelValue } from '../utils/channelValue';
import { easeField } from '../utils/fields/easeField';
import { familyOf } from '../utils/familyOf';
import { formatVec3 } from '../utils/formatVec3';
import { overField } from '../utils/fields/overField';
import { readoutField } from '../utils/fields/readoutField';
import { toField } from '../utils/fields/toField';
import { formatNameList } from '../../utils/format/formatNameList';
import { formatNumber } from '../../utils/format/formatNumber';
import { formatQuantity } from '../../utils/format/formatQuantity';
import { formatMpc } from '../../utils/format/formatMpc';
import {
  DEFAULT_ALIGN_SEC,
  DEFAULT_LINGER,
  DEFAULT_LINGER_SEC,
  DEFAULT_RAMP_SEC,
} from '../../../../../src/services/engine/animation/pathDefaults';
import type { Channel } from '../../../../../src/@types/animation/Channel';
import type { RowKindRegistry } from '../../@types/kinds/RowKindRegistry';

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

export const cameraKinds: Pick<
  RowKindRegistry,
  'set' | 'setVec' | 'spin' | 'rate' | 'osc' | 'aimAlong' | 'flyPath' | 'geodesic'
> = {
  set: {
    mark: 'bar',
    writes: (s) => familyOf(s.ch),
    label: (s) => ({ name: CHANNEL_NAME[s.ch], op: '→', value: channelValue(s.ch, s.to) }),
    fields: [readoutField('ch', 'Channel'), toField(), overField(), easeField()],
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
      name: CHANNEL_NAME[s.ch],
      op: s.by < 0 ? '−' : '+',
      value: channelValue(s.ch, Math.abs(s.by)),
      ...(s.loop === true ? { qualifier: 'loops' } : {}),
    }),
    fields: [
      readoutField('ch', 'Channel'),
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
      readoutField('ch', 'Channel'),
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
      readoutField('ch', 'Channel'),
      { key: 'amp', param: 'amp', label: 'Swing', control: (s) => channelControl(s.ch) },
      { key: 'period', param: 'period', label: 'Period', control: 'seconds' },
      overField('Window', { optional: true }),
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
      { ...readoutField('spline', 'Spline'), optional: true },
      { ...readoutField('passBy', 'Pass by'), optional: true },
    ],
  },
  geodesic: {
    glyph: 'dist',
    mark: 'composite',
    writes: () => ['distance', 'lookAt'],
    label: (s) => ({ name: 'Zoom-pan', op: '→', value: formatMpc(s.to.distance) }),
    fields: [
      readoutField('to', 'Destination'),
      overField('Duration', { optional: true }),
      readoutField('tuning', 'Tuning'),
      readoutField('fovYRad', 'FOV'),
    ],
  },
};
