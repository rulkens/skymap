/**
 * createDeadHostSet — tracks consecutive connection failures per host and
 * retires a host once it crosses the streak. See `DeadHostSet` for why there
 * is no recovery path and why an HTTP answer counts as alive.
 */

import type { DeadHostSet } from '../../@types/network/DeadHostSet';
import { DEAD_HOST_STREAK } from '../../data/network/deadHostStreak';

export function createDeadHostSet(): DeadHostSet {
  // host → consecutive dead connections. An entry at/above the streak is
  // terminal: nothing removes it or resets it back down.
  const failures = new Map<string, number>();

  // A URL the platform can't parse has no host to attribute anything to.
  // Swallowed rather than thrown: this sits directly in the fetch path, and a
  // relative URL (the famous/hi-res legs use one) is not an error here.
  const hostOf = (url: string): string | null => {
    try {
      return new URL(url, 'http://localhost').host;
    } catch {
      return null;
    }
  };

  return {
    isDead(url) {
      const host = hostOf(url);
      return host !== null && (failures.get(host) ?? 0) >= DEAD_HOST_STREAK;
    },

    note(url, alive) {
      const host = hostOf(url);
      if (host === null) return;
      const seen = failures.get(host) ?? 0;
      if (seen >= DEAD_HOST_STREAK) return; // terminal — no recovery
      failures.set(host, alive ? 0 : seen + 1);
    },
  };
}
