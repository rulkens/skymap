/**
 * checkoutMismatch — the warning for a tool pointed at another checkout's
 * server (a worktree's tool measuring main's server silently measures main).
 * A built bundle reports an empty root, so '' means "cannot say", not "wrong".
 */
export function checkoutMismatch(serverRoot: string, ownRoot: string): string | null {
  const strip = (p: string): string => p.replace(/\/+$/, '');
  if (serverRoot === '' || strip(serverRoot) === strip(ownRoot)) return null;
  return `warning: the server runs from ${serverRoot} but this tool runs from ${ownRoot}`;
}
