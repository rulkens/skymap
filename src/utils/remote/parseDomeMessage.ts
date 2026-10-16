/**
 * parseDomeMessage — the remote page's inbound parser: text off the relay
 * becomes a `DomeMessage`, or null. It checks every field the page reads has
 * the right primitive type, so a stray or stale message cannot crash a render;
 * ids are checked as strings only, since the remote just echoes them back and
 * the dome's own parser validates them against its registries.
 */

import { isFiniteIn } from '../math/isFiniteIn';
import { isRecord } from '../object/isRecord';
import type { DomeMessage } from '../../@types/remote/DomeMessage';

const isNumber = (raw: unknown): boolean => isFiniteIn(raw, -Infinity, Infinity);

function isAction(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  switch (raw.kind) {
    case 'focus':
      return typeof raw.focusId === 'string';
    case 'exhibit':
      return typeof raw.exhibitId === 'string';
    case 'tour':
      return typeof raw.tourId === 'string';
    case 'flyTo':
      return isNumber(raw.lonDeg) && isNumber(raw.latDeg) && isNumber(raw.altKm);
    default:
      return false;
  }
}

const isTour = (raw: unknown): boolean =>
  isRecord(raw) &&
  typeof raw.id === 'string' &&
  isNumber(raw.beatIndex) &&
  isNumber(raw.beatCount) &&
  typeof raw.paused === 'boolean';

const isTime = (raw: unknown): boolean =>
  isRecord(raw) &&
  isNumber(raw.simDays) &&
  isNumber(raw.rateIndex) &&
  (raw.direction === 1 || raw.direction === -1) &&
  typeof raw.paused === 'boolean' &&
  (raw.mode === 'live' || raw.mode === 'manual');

const isToggle = (raw: unknown): boolean =>
  isRecord(raw) &&
  typeof raw.id === 'string' &&
  typeof raw.label === 'string' &&
  typeof raw.enabled === 'boolean';

const isStatus = (raw: unknown): boolean =>
  isRecord(raw) &&
  (raw.focus === null || (isRecord(raw.focus) && typeof raw.focus.id === 'string')) &&
  (raw.tour === null || isTour(raw.tour)) &&
  isTime(raw.time) &&
  Array.isArray(raw.toggles) &&
  raw.toggles.every(isToggle);

const isMatch = (raw: unknown): boolean =>
  isRecord(raw) &&
  typeof raw.name === 'string' &&
  typeof raw.kind === 'string' &&
  isAction(raw.action);

const isMenuItem = (raw: unknown): boolean =>
  isRecord(raw) && typeof raw.id === 'string' && typeof raw.label === 'string';

const isMenu = (raw: unknown): boolean =>
  isRecord(raw) &&
  [raw.tours, raw.exhibits, raw.clips].every(
    (list) => Array.isArray(list) && list.every(isMenuItem),
  );

export function parseDomeMessage(text: string): DomeMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  if (raw.kind === 'status') {
    return isStatus(raw.status) ? (raw as DomeMessage) : null;
  }
  if (raw.kind === 'menu') {
    return isMenu(raw.menu) ? (raw as DomeMessage) : null;
  }
  if (raw.kind === 'searchResults') {
    const { requestId, matches } = raw;
    if (typeof requestId !== 'string' || !Array.isArray(matches)) return null;
    return matches.every(isMatch) ? (raw as DomeMessage) : null;
  }
  return null;
}
