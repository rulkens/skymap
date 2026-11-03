/**
 * parseDomeMessage — the remote page's inbound parser. Null for text that is no
 * dome message: the room also carries every other phone's messages, which must
 * never read as a version mismatch, so the kind is checked before the version.
 * A dome kind returns the sender's `v`, and the message only at this page's own
 * version: another version's body is not this page's shape to judge. The body
 * check covers every field the page reads, so a stray message cannot crash a
 * render; ids are checked as strings only, since the dome validates them.
 */

import { isRecord } from '../object/isRecord';
import { REMOTE_PROTOCOL_VERSION } from '../../data/remote/remoteProtocolVersion';
import type { DomeMessage } from '../../@types/remote/DomeMessage';

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
      return (
        Number.isFinite(raw.lonDeg) && Number.isFinite(raw.latDeg) && Number.isFinite(raw.altKm)
      );
    default:
      return false;
  }
}

const isTour = (raw: unknown): boolean =>
  isRecord(raw) &&
  typeof raw.id === 'string' &&
  Number.isFinite(raw.beatIndex) &&
  Number.isFinite(raw.beatCount) &&
  typeof raw.paused === 'boolean';

const isTime = (raw: unknown): boolean =>
  isRecord(raw) &&
  Number.isFinite(raw.simDays) &&
  Number.isFinite(raw.rateIndex) &&
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
  isRecord(raw.controls) &&
  (raw.controls.scheme === 'skymap' || raw.controls.scheme === 'openspace') &&
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

const IS_BODY: Record<DomeMessage['kind'], (raw: Record<string, unknown>) => boolean> = {
  status: (raw) => isStatus(raw.status),
  menu: (raw) => isMenu(raw.menu),
  searchResults: ({ requestId, matches }) =>
    typeof requestId === 'string' && Array.isArray(matches) && matches.every(isMatch),
};

export function parseDomeMessage(text: string): { v: number; message: DomeMessage | null } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || typeof raw.kind !== 'string' || !Object.hasOwn(IS_BODY, raw.kind)) {
    return null;
  }
  const v = raw.v ?? 1;
  if (typeof v !== 'number') return null;
  const isBody = IS_BODY[raw.kind as DomeMessage['kind']];
  return { v, message: v === REMOTE_PROTOCOL_VERSION && isBody(raw) ? (raw as DomeMessage) : null };
}
