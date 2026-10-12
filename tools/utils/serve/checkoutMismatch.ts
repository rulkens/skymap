/**
 * A worktree's tool pointed at main's server silently measures main.
 * A built bundle reports an empty root, so '' means "cannot say", not "wrong".
 */
export function checkoutMismatch(serverRoot: string, ownRoot: string): string | null {
  if (serverRoot === '' || serverRoot === ownRoot) return null;
  return `warning: the server runs from ${serverRoot} but this tool runs from ${ownRoot}`;
}
