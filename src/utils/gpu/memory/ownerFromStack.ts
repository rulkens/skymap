// Matches both V8 frame shapes (`at fn (url:line:col)` and `at url:line:col`)
// and captures the URL's bare basename directly — no dirs, extension, or
// Vite's dev `?t=...` cache-busting query, which would otherwise leak into
// the owner name.
const STACK_FRAME_RE =
  /at\s+(?:\S+\s+\()?https?:\/\/[^\s)]*\/([^/?]+?)\.[^./?]+(?:\?[^:]*)?:\d+:\d+\)?/;

/** Find the first stack frame NOT in `skipBasename` (the ledger's own file,
 *  since every allocation's stack starts inside its wrapped create* call) and
 *  return its source basename — the create call's actual caller. `null` when
 *  no frame parses (e.g. a minified/native frame). */
export function ownerFromStack(stack: string, skipBasename: string): string | null {
  for (const line of stack.split('\n')) {
    const match = STACK_FRAME_RE.exec(line);
    if (!match) continue;
    if (match[1] !== skipBasename) return match[1]!;
  }
  return null;
}
