/**
 * The Project pages for developers print tables from data files. These hold
 * those files to the repository: a script added to package.json, or a part
 * added to the debug panel, would otherwise be missing from a page that reads
 * as complete, and a manual that moved would be a dead link.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import pkg from '../../../package.json';
import {
  DOCS_COMMANDS,
  DOCS_COMMANDS_UNLISTED,
} from '../../../packages/website/src/data/docsCommands';
import { DOCS_DEBUG_SECTIONS } from '../../../packages/website/src/data/docsDebugSections';
import { WORKBENCHES } from '../../../packages/website/src/data/workbenches';
import { APP_COMPOSITION } from '../../../src/compositions/app';
import { layerUiContents } from '../../../src/utils/layer/layerUiContents';
import { DEV_PORTS } from '../../../tools/utils/io/devPorts';
import { toolPages } from '../../../tools/utils/io/toolPages';

const ROOT = resolve(import.meta.dirname, '../../..');
const sorted = (names: readonly string[]) => [...names].sort();
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

describe('Command-line tools page', () => {
  const rows = DOCS_COMMANDS.flatMap((group) => group.rows);
  const listed = rows.flatMap((row) => row.scripts);
  const unlisted = DOCS_COMMANDS_UNLISTED.flatMap((kind) => kind.scripts);

  it('gives every script of package.json a row or a reason to have none, once', () => {
    expect(sorted([...listed, ...unlisted])).toEqual(sorted(Object.keys(pkg.scripts)));
  });

  it('names a manual that is in the repository', () => {
    expect(rows.filter((row) => !existsSync(join(ROOT, row.manual)))).toEqual([]);
  });
});

describe('Debug page', () => {
  it('has a row for every part the panel mounts', () => {
    const panel = read('src/components/DebugPanel/DebugPanel.tsx');
    // The panel's own parts are tags whose name ends in Section, SectionContainer or Row; the Layers' are a list.
    const own = panel.match(/^\s*<\w+(?:Section|SectionContainer|Row)\b/gm) ?? [];
    const layers = layerUiContents(APP_COMPOSITION.layers, 'debug');
    expect(DOCS_DEBUG_SECTIONS).toHaveLength(own.length + layers.length);
  });

  it('gives each part the heading its file draws', () => {
    const missing = DOCS_DEBUG_SECTIONS.filter((section) => {
      const text = existsSync(join(ROOT, section.file)) ? read(section.file) : '';
      return ![section.heading, section.heading.replace('&', '&amp;')].some((heading) =>
        text.includes(heading),
      );
    });
    expect(missing.map((section) => section.heading)).toEqual([]);
  });
});

describe('Developer workbenches page', () => {
  // The app and this site have rows in both tables and are not workbenches.
  it('lists every page built beside the app, at its path', () => {
    const published = Object.entries(toolPages).filter(([name]) => name !== 'website');
    expect(sorted(WORKBENCHES.flatMap((bench) => bench.publicPath ?? []))).toEqual(
      sorted(published.map(([, folder]) => `/${folder}/`)),
    );
  });

  it('lists every tool that has a port, on its port', () => {
    const ports = Object.entries(DEV_PORTS).filter(([name]) => !['main', 'website'].includes(name));
    expect(sorted(WORKBENCHES.flatMap((bench) => (bench.port ? String(bench.port) : [])))).toEqual(
      sorted(ports.map(([, port]) => String(port))),
    );
  });

  // The two tests above compare sets, which two tools with their ports swapped would pass.
  it('gives each tool the port and the path its own Vite config names', () => {
    const served = WORKBENCHES.filter((bench) => bench.port !== undefined);
    const fromConfig = served.map((bench) => {
      const script = pkg.scripts[bench.script as keyof typeof pkg.scripts];
      const config = read(/--config (\S+)/.exec(script)![1]!);
      const port = /DEV_PORTS\.(\w+)/.exec(config)![1] as keyof typeof DEV_PORTS;
      const page = /\{toolPages\.(\w+)\}/.exec(config)?.[1] as keyof typeof toolPages | undefined;
      return {
        id: bench.id,
        port: DEV_PORTS[port],
        publicPath: page && `/${toolPages[page]}/`,
      };
    });
    expect(fromConfig).toEqual(
      served.map(({ id, port, publicPath }) => ({ id, port, publicPath })),
    );
  });

  it('names a script and a manual that exist', () => {
    expect(
      WORKBENCHES.filter(
        (bench) => !(bench.script in pkg.scripts) || !existsSync(join(ROOT, bench.manual)),
      ),
    ).toEqual([]);
  });
});
