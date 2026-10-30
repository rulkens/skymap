/**
 * The queue through which page designers ask for pictures and whoever runs the shoot answers: one
 * JSON file per request (`ShotRequest`) in a gitignored folder, validated on every write and read.
 *
 *   npm run site:requests -- list [--open]
 *   npm run site:requests -- add --requester <who> --page /home-2/ --section <h2> --subject <what> --why <why>
 *       [--shot <id>|new] [--link '<hash body>'] [--settings '<json>'] [--size 1600x1000]
 *   npm run site:requests -- answer <file> --status done|declined [--ids a,b] --answer "…"
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';

import { SITE_SHOTS } from '../../packages/website/src/data/siteShots';
import type { ShotRequest } from './@types/ShotRequest';
import { parseSize } from './utils/parseSize';
import { shotRequestFileName } from './utils/shotRequestFileName';
import { shotRequestProblems } from './utils/shotRequestProblems';

const DIR = '.superpowers/sdd/2026-10-05-companion-website/shot-requests';
const SHOT_IDS = SITE_SHOTS.map((shot) => shot.id);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    open: { type: 'boolean', default: false },
    requester: { type: 'string' },
    page: { type: 'string' },
    section: { type: 'string' },
    shot: { type: 'string', default: 'new' },
    subject: { type: 'string' },
    link: { type: 'string' },
    settings: { type: 'string' },
    size: { type: 'string' },
    why: { type: 'string' },
    status: { type: 'string' },
    ids: { type: 'string' },
    answer: { type: 'string' },
  },
});

const fail = (problems: string[]) => {
  console.error(problems.map((p) => `- ${p}`).join('\n'));
  process.exit(1);
};
const save = (file: string, request: ShotRequest) => {
  const problems = shotRequestProblems(request, SHOT_IDS);
  if (problems.length > 0) fail(problems);
  writeFileSync(file, `${JSON.stringify(request, null, 2)}\n`);
};

mkdirSync(DIR, { recursive: true });
const [command, target] = positionals;
if (command === 'list') {
  for (const name of readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const request = JSON.parse(readFileSync(join(DIR, name), 'utf8')) as ShotRequest;
    if (values.open && request.status !== 'open') continue;
    const problems = shotRequestProblems(request, SHOT_IDS);
    console.log(
      [
        `${request.status.toUpperCase()}  ${name}`,
        `  ${request.requester} · ${request.page} · "${request.section}" · ${request.shotId}: ${request.subject}`,
        `  why: ${request.why}`,
        ...(request.link ? [`  link: ${request.link}`] : []),
        ...(request.settings ? [`  settings: ${JSON.stringify(request.settings)}`] : []),
        ...(request.answer ? [`  answer: ${request.answer}`] : []),
        ...(request.resultIds ? [`  use: ${request.resultIds.join(', ')}`] : []),
        ...problems.map((p) => `  INVALID: ${p}`),
      ].join('\n'),
    );
  }
} else if (command === 'add') {
  const request: ShotRequest = {
    requester: values.requester ?? '',
    page: values.page ?? '',
    section: values.section ?? '',
    shotId: values.shot,
    subject: values.subject ?? '',
    ...(values.link ? { link: values.link.replace(/^#/, '') } : {}),
    ...(values.settings ? { settings: JSON.parse(values.settings) } : {}),
    ...(values.size ? { size: parseSize(values.size) } : {}),
    why: values.why ?? '',
    status: 'open',
  };
  const file = join(DIR, shotRequestFileName(new Date(), request.requester, request.subject));
  save(file, request);
  console.log(file);
} else if (command === 'answer' && target) {
  const file = join(DIR, basename(target));
  if (!existsSync(file)) fail([`no request ${file}`]);
  const request = JSON.parse(readFileSync(file, 'utf8')) as ShotRequest;
  save(file, {
    ...request,
    status: values.status as ShotRequest['status'],
    ...(values.answer ? { answer: values.answer } : {}),
    ...(values.ids ? { resultIds: values.ids.split(',') } : {}),
  });
  console.log(`${file}: ${values.status}`);
} else {
  fail(['give a command: list [--open], add …, or answer <file> --status done|declined …']);
}
