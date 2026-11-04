import type { ControlStatus } from '../../../@types/ControlStatus';

/** True when the last sync left the sky without data it needs, so "Update now" is a retry. */
export function needsRetry(status: ControlStatus): boolean {
  switch (status.kind) {
    case 'diskFull':
      return true;
    case 'offline':
    case 'failed':
      return !status.hasData;
    default:
      return false;
  }
}
