/**
 * An address cut where a line may break: after a slash that ends a path segment, and before the `#`.
 * The `//` after the scheme is never cut, and nothing inside a piece is, so a room code stays whole.
 */
export function urlLinePieces(url: string): string[] {
  return url.split(/(?<=[^/]\/)(?!\/)|(?=#)/);
}
