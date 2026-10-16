/**
 * parseDeviceEvent — a `DeviceEvent` off the wire, or null. The dome's recognizer
 * trusts what it is fed, so every arm is checked whole and rebuilt with only its
 * own fields: nothing extra rides into the store.
 */

import { isFiniteIn } from '../math/isFiniteIn';
import { isRecord } from '../object/isRecord';
import type { DeviceEvent } from '../../@types/input/DeviceEvent';
import type { Modifiers } from '../../@types/input/Modifiers';
import type { UnitPoint } from '../../@types/input/UnitPoint';

const MAX_SIZE_PX = 16384;
const POINTER_IDS = 2 ** 31;
// Wider than 0..1 on purpose: the device channel follows a drag onto the whole
// window, so moves and the final `up` of a drag that leaves the trackpad land
// outside it. Dropping them would freeze the drag and strand the pointer.
const AT_MIN = -10;
const AT_MAX = 11;

function unitPoint(raw: unknown): UnitPoint | null {
  if (!isRecord(raw) || !isFiniteIn(raw.x, AT_MIN, AT_MAX) || !isFiniteIn(raw.y, AT_MIN, AT_MAX))
    return null;
  return { x: raw.x, y: raw.y };
}

function modifiers(raw: unknown): Modifiers | null {
  if (!isRecord(raw)) return null;
  const { shift, ctrl, alt, meta } = raw;
  if (typeof shift !== 'boolean' || typeof ctrl !== 'boolean') return null;
  if (typeof alt !== 'boolean' || typeof meta !== 'boolean') return null;
  return { shift, ctrl, alt, meta };
}

export function parseDeviceEvent(raw: unknown): DeviceEvent | null {
  if (!isRecord(raw) || !isFiniteIn(raw.t, -Infinity, Infinity)) return null;
  const t = raw.t;
  switch (raw.kind) {
    case 'down':
    case 'move':
    case 'up':
    case 'cancel': {
      const { kind, pointer, pointerType, button } = raw;
      if (typeof pointer !== 'number' || !Number.isInteger(pointer)) return null;
      if (pointer < 0 || pointer >= POINTER_IDS) return null;
      if (pointerType !== 'mouse' && pointerType !== 'touch' && pointerType !== 'pen') return null;
      if (button !== 0 && button !== 1 && button !== 2) return null;
      const at = unitPoint(raw.at);
      const mods = modifiers(raw.mods);
      if (!at || !mods) return null;
      return { kind, t, pointer, pointerType, button, at, mods };
    }
    case 'wheel': {
      const { ratio } = raw;
      if (!isFiniteIn(ratio, 0, Infinity) || ratio === 0) return null;
      const at = unitPoint(raw.at);
      const mods = modifiers(raw.mods);
      if (!at || !mods) return null;
      return { kind: 'wheel', t, ratio, at, mods };
    }
    case 'leave':
      return { kind: 'leave', t };
    case 'resize': {
      const { widthPx, heightPx } = raw;
      if (!isFiniteIn(widthPx, 1, MAX_SIZE_PX) || !isFiniteIn(heightPx, 1, MAX_SIZE_PX))
        return null;
      return { kind: 'resize', t, widthPx, heightPx };
    }
    default:
      return null;
  }
}
