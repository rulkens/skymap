/** Text for a computed, non-editable field: numbers and names as typed, vectors as `x, y, z`, a channel by its Name, a zoom-pan's destination as `position · distance`. */
import { CHANNEL_NAME } from '../../data/channelNames';
import { formatVec3 } from '../../kinds/utils/formatVec3';
import { formatNameList } from '../../utils/format/formatNameList';
import { formatNumber } from '../../utils/format/formatNumber';
import { formatMpc } from '../../utils/format/formatMpc';
import { formatPosition } from '../../utils/format/formatPosition';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { Channel } from '../../../../../src/@types/animation/Channel';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function readoutText(param: string, value: unknown): string {
  if (param === 'ch' && typeof value === 'string') return CHANNEL_NAME[value as Channel] ?? value;
  if (value === null) return 'none';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return formatNumber(value);
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === 'number')
      ? formatVec3(value as Vec3)
      : formatNameList(value.map(String));
  }
  if (typeof value === 'object' && 'target' in value && 'distance' in value) {
    const { target, distance } = value as Extract<Effect, { kind: 'geodesic' }>['to'];
    return `${formatPosition(target)} · ${formatMpc(distance)}`;
  }
  return value === undefined ? '–' : 'custom';
}
