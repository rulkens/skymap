/**
 * parseOmmEpochMs — an OMM `EPOCH` (`2026-10-27T03:45:44.572896`, UTC by the OMM standard) to Unix
 * ms. Not `Date.parse`: with no zone suffix it reads the string as LOCAL time, and it drops the
 * microseconds, which are 7 m of low-orbit travel each millisecond.
 */
const OMM_EPOCH = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?$/;

export function parseOmmEpochMs(epoch: string): number {
  const m = OMM_EPOCH.exec(epoch);
  if (!m) throw new Error(`parseOmmEpochMs: not an OMM epoch: "${epoch}"`);
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  return Date.UTC(y!, mo! - 1, d!, h!, mi!, s!) + (m[7] ? Number(m[7]) * 1000 : 0);
}
