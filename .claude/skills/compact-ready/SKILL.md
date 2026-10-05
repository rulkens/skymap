---
name: compact-ready
description: Use when the user asks "can I compact" / "/compact-ready", or proactively before suggesting compaction — verifies all load-bearing state is on disk, writes what isn't, then gives a one-line go/hold verdict
---

# Compact-ready

Judge whether this is a safe moment to compact, make it safe if it nearly is,
and answer in one short block. The user compacts early and often (target: main
context under ~30%); the only real hazard is state that lives ONLY in the
conversation. This skill's job is to move that state to disk, not to gatekeep.

## The test

Compaction is safe when a fresh session could resume from disk alone. Check
each item; anything failing gets WRITTEN now — that's the skill's work, not a
reason to answer "no":

1. **Resume map** — an authoritative on-disk record of where we are: SDD
   ledger, plan checkboxes, or a memory file. If the current effort has none,
   write or update one before answering.
2. **In-flight background agents** — for each live agent: purpose + what to do
   with its result, recorded on disk. Notifications survive compaction; the
   handling plan must too.
3. **Queued sequence** — the agreed next actions written down verbatim,
   including any user directives given this session ("merge main when done",
   "own PR for X").
4. **Open decisions and rulings** — any adjudication or user answer that
   exists only in chat gets recorded where it belongs (ledger, plan, memory).
5. **Mid-edit state** — halfway through a multi-file edit, or an uncommitted
   tree mixing units? Finish or commit the unit first. This is the one genuine
   "hold" case.

## Verdict format

Your **final message** of the turn is the verdict: do all writing first, and
make no tool calls after it. Its **first line** starts with exactly one of
these, as plain text (no markdown, bold, backticks, quote or preamble before
it), because tools such as claude-dash read it to auto-compact:

    Compact-safe — resume map: <path(s)>
    Hold: <the one thing in progress>

- After `Compact-safe`, one line per thing just written.
- After `Hold:`, what makes it safe and roughly how long (usually <2 min). Don't
  put the words "Compact-safe" anywhere in a Hold reply.

Nothing else in the message: no summary, no question. Never answer a bare
"yes" — the value of the check is the writing it triggers.

If the `mcp__claude-dash-ui__compact_verdict` tool is available, call it with
the verdict right before your final message (after all writing):
`verdict: "safe"` with `resumeMap`, or `verdict: "hold"` with `reason`. Then
give the text verdict as usual.

## Proactive use

Don't wait to be asked. At natural boundaries — commit landed and ledger
updated, background agents dispatched with their handling recorded — end the
turn with a one-line `Compact-safe (resume: <path>)` marker so the user can
compact without asking.
