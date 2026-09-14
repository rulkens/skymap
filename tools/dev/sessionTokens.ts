#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { buildProjectTree } from '../utils/session/buildProjectTree';
import { buildSessionTree } from '../utils/session/buildSessionTree';
import type { SessionTokenNode } from '../utils/session/SessionTokenNode';

// Reports where a Claude Code session's tokens went: per turn, per skill, per subagent.
// Usage: npm run session-tokens [-- <transcript.jsonl|sessionId>] [--across] [--json] [--depth N]
// With no argument it reads the newest transcript for the current working directory;
// --across rolls every session for this project up by git branch, for work that ran
// over several sittings and several PRs.

const projectDir = (cwd: string): string =>
  join(homedir(), '.claude', 'projects', cwd.replace(/[/.]/g, '-'));

const newestTranscript = (dir: string): string => {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const newest = files[0];
  if (!newest) throw new Error(`no transcripts in ${dir}`);
  return newest;
};

/** Subagent transcripts sit in <transcript-dir>/<session-id>/subagents/agent-<id>.jsonl. */
const loadSubagents = (transcript: string): Map<string, string> => {
  const subs = join(dirname(transcript), basename(transcript, '.jsonl'), 'subagents');
  const out = new Map<string, string>();
  if (!existsSync(subs)) return out;
  for (const file of readdirSync(subs)) {
    const id = /^agent-(.+)\.jsonl$/.exec(file)?.[1];
    if (id) out.set(id, readFileSync(join(subs, file), 'utf8'));
  }
  return out;
};

const thousands = (n: number): string => n.toLocaleString('en-US');

const pct = (part: number, whole: number): string =>
  whole === 0 ? '  0%' : `${String(Math.round((part / whole) * 100)).padStart(3)}%`;

const render = (
  n: SessionTokenNode,
  rootBilled: number,
  depth: number,
  maxDepth: number,
  prefix = '',
): string[] => {
  const head = `${prefix}${n.label}`;
  const cols = `${thousands(n.total.billed).padStart(11)}  ${pct(n.total.billed, rootBilled)}  ${String(n.total.requests).padStart(4)} req`;
  const lines = [`${head.padEnd(72).slice(0, 72)} ${cols}`];
  if (depth >= maxDepth) return lines;
  const kids = n.children;
  kids.forEach((c, i) => {
    const last = i === kids.length - 1;
    const stem = prefix.replace(/[├└]── $/, (m) => (m.startsWith('└') ? '    ' : '│   '));
    lines.push(...render(c, rootBilled, depth + 1, maxDepth, `${stem}${last ? '└── ' : '├── '}`));
  });
  return lines;
};

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const positional = args.find((a) => !a.startsWith('--') && a !== flag('--depth'));

const dir = projectDir(process.cwd());
const path = !positional
  ? newestTranscript(dir)
  : positional.endsWith('.jsonl')
    ? positional
    : join(dir, `${positional}.jsonl`);

const readSession = (file: string) => ({
  label: basename(file, '.jsonl'),
  text: readFileSync(file, 'utf8'),
  subagents: loadSubagents(file),
});

const tree = args.includes('--across')
  ? buildProjectTree(
      readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => readSession(join(dir, f))),
      basename(dir),
    )
  : (({ text, subagents, label }) => buildSessionTree(text, subagents, label))(readSession(path));

if (args.includes('--json')) {
  console.log(JSON.stringify(tree, null, 2));
} else {
  const t = tree.total;
  const maxDepth = Number(flag('--depth') ?? 2);
  console.log(render(tree, t.billed, 0, maxDepth).join('\n'));
  console.log(
    `\nbilled ${thousands(t.billed)} = input ${thousands(t.input)} + cache write ${thousands(t.cacheWrite)} ` +
      `+ cache read ${thousands(t.cacheRead)} + output ${thousands(t.output)}  over ${t.requests} requests`,
  );
  console.log(`${tree.startedAt} → ${tree.endedAt}`);
}
