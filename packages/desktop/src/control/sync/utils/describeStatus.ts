import type { ControlStatus } from '../../../@types/ControlStatus';
import type { StatusView } from '../@types/StatusView';
import type { SyncState } from '../@types/SyncState';
import { STATUS_VIEW } from '../data/statusView';

/** The download's words and controls for main's current state. */
export function describeStatus(sync: SyncState): StatusView {
  // The table is keyed by kind, so the entry always matches the status it is given.
  const view = STATUS_VIEW[sync.status.kind] as (status: ControlStatus, s: SyncState) => StatusView;
  return view(sync.status, sync);
}
