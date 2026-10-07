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
import { APP_COMPOSITION } from '../../../src/compositions/app';
import { layerUiContents } from '../../../src/utils/layer/layerUiContents';

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
