/** The focus id's display name from the remote's latest search matches; null when it cannot tell. */
import type { RemoteSearchMatch } from '../../@types/remote/RemoteSearchMatch';

export function focusNameFrom(id: string, matches: readonly RemoteSearchMatch[]): string | null {
  const match = matches.find((m) => m.action.kind === 'focus' && m.action.focusId === id);
  return match?.name ?? null;
}
