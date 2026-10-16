/** The focus id's display name from what the remote already holds; null when it cannot tell. */
import type { RemoteSearchMatch } from '../../@types/remote/RemoteSearchMatch';

export function focusNameFrom(
  id: string,
  known: { searchMatches: readonly RemoteSearchMatch[] },
): string | null {
  const match = known.searchMatches.find(
    (m) => m.action.kind === 'focus' && m.action.focusId === id,
  );
  return match?.name ?? null;
}
