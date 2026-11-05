import type { SyncFailure } from '../../../@types/SyncFailure';

/** What a failed first download says, by reason; Retry stays offered, since each can clear by itself. */
export const FAILURE_TEXT: { [R in SyncFailure['reason']]: string } = {
  noList: 'The data server has no download list. Retry, or try again later.',
  stale:
    'The data server is being updated: some files it lists are not there yet. Try again later.',
  error: 'The download stopped before it finished. Retry, or try again later.',
};
