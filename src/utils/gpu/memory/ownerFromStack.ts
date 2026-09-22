import { basenameOfSourceUrl } from './basenameOfSourceUrl';

// Matches both V8 frame shapes: `at fn (url:line:col)` and `at url:line:col`.
// The URL itself may carry a `?query`, so the line/col suffix — not the
// query's own colons — is what anchors the capture.
const STACK_FRAME_RE = /at\s+(?:\S+\s+\()?(https?:\/\/[^\s)]+):\d+:\d+\)?/;

/** Find the first stack frame NOT in `skipBasename` (the ledger's own file,
 *  since every allocation's stack starts inside its wrapped create* call) and
 *  return its source basename — the create call's actual caller. `null` when
 *  no frame parses (e.g. a minified/native frame). */
export function ownerFromStack(stack: string, skipBasename: string): string | null {
  for (const line of stack.split('\n')) {
    const match = STACK_FRAME_RE.exec(line);
    if (!match) continue;
    const basename = basenameOfSourceUrl(match[1]!);
    if (basename !== skipBasename) return basename;
  }
  return null;
}
