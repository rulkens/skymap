---
name: dev
description: Start or stop the skymap Vite dev server in the current worktree. Use when the user types `/dev` or `/dev-stop`, or asks to "start the dev server", "spin up dev", "kill the dev server", or similar. Backgrounds `npm run dev` and reports the URL; reuses the running server if one exists in this session.
---

This skill defines two slash commands for managing the Vite dev server in the
current worktree. Worktrees can run multiple servers simultaneously because
Vite's port (5173 in `vite.config.ts`) is non-strict — collisions auto-increment
to the next free port.

The skill leans entirely on the Claude Code harness's `run_in_background` Bash
behavior — output streams to the harness footer, is readable via `BashOutput`,
and the shell can be killed via `KillShell`. No PID files, no `/tmp` logs, no
`lsof` discovery.

## `/dev` — start (or report) the dev server

1. **Check for an existing shell.** If you started a dev server in this session
   and remember the shell ID, call `BashOutput` on it. If it's still running
   *and* its output contains a `Local: http://localhost:<port>/` line, report
   that URL and exit. Do not spawn a duplicate.

2. **Launch.** Run `npm run dev` with `run_in_background: true`. Capture the
   returned shell ID.

3. **Wait for the `Local:` line.** Poll `BashOutput` on the new shell. Vite
   normally prints `Local: http://localhost:<port>/` within 1–2 s, but cold
   starts (first WESL compile, fresh `tsx`) can take longer. Allow up to 15 s.

4. **Report.** Extract the port with a regex like `Local:\s+http://localhost:(\d+)/`.
   Print one line: `Dev server: http://localhost:<port> (shell <id>)`.

5. **On timeout** (no `Local:` line within 15 s): dump the last ~30 lines of
   `BashOutput` so the failure is visible (WESL linker error, missing
   dependency, port range exhausted, etc.). Do not retry automatically.

## `/dev-stop` — kill the dev server

1. **If a shell ID is known**, call `KillShell` on it. Read the recorded port
   from earlier and report: `Stopped dev server (was on <port>)`.

2. **If no shell ID is known** (fresh session, or you've forgotten it), tell
   the user — don't go hunting via `lsof` or `pkill`. Session-scoped lifecycle
   means a forgotten shell will be reaped when the session ends anyway.

## Why this design

- **Ephemeral ports are fine.** The user does not need stable worktree-to-port
  mapping; 2–3 simultaneous worktrees keeps collision risk low and Vite's
  non-strict port config auto-increments.
- **Session-scoped lifecycle is sufficient.** Servers die with the Claude
  session; that matches the worktree workflow (wrap up, end session).
- **The harness already does the hard parts.** Output capture, process
  management, and kill semantics are all built-in. Pidfiles, `/tmp` logs, and
  `lsof` discovery were considered and rejected as unnecessary state.

## Anti-patterns

- **Don't** write a `/tmp/skymap-dev-*.log` or `.claude/dev-pid` file. The
  harness's `BashOutput` is the log; the shell ID is the handle.
- **Don't** add a `--port <N>` flag to `npm run dev`. Vite's auto-increment is
  what makes multiple worktrees coexist without coordination.
- **Don't** change `vite.config.ts`'s `port: 5173` to `strictPort: true`. That
  would break the auto-increment behavior this skill relies on.
- **Don't** spin up a dev server unprompted at session start. Some sessions
  read docs, write plans, or do offline work and don't need a server.
