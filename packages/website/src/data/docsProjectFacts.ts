import type { Fact } from '../@types/Fact';
import pkg from '../../../../package.json';
import { REPO_BLOB } from './siteIdentity';

const CHECKED = '2026-10-07';
const IN_REPO = 'in the skymap repository';
const BACKLOG = `${REPO_BLOB}/docs/BACKLOG.md`;
const BACKLOG_LABEL = `the list of work not yet started, ${IN_REPO}`;
const DEPLOY = `${REPO_BLOB}/docs/DEPLOY.md`;
const TOOL_PAGES = `${REPO_BLOB}/tools/utils/io/toolPages.ts`;

/**
 * What the Roadmap and the three pages for developers rest on, spread into
 * FACTS. All are statements about the project or the app's mechanics, each
 * citing the file it was read in on the check date; the debug panel, the flags
 * and each workbench were also opened that day. The rows of the roadmap itself
 * are in data/roadmap.ts and the tables in data/docsCommands.ts,
 * data/docsDebugSections.ts and data/workbenches.ts.
 */
export const DOCS_PROJECT_FACTS: readonly Fact[] = [
  // Roadmap
  {
    id: 'road-states',
    about: 'app',
    text: '“Partly built” has a part in the repository already; “planned” is ready to build or needs a design first; “an idea” is set aside, not yet decided, or waits on other work or a fact to be checked.',
    source: BACKLOG,
    sourceLabel: BACKLOG_LABEL,
    checked: CHECKED,
  },
  {
    id: 'road-suggest',
    about: 'app',
    text: 'The repository asks for an issue before any change larger than a small fix, so that the approach can be talked over before code is written.',
    source: `${REPO_BLOB}/CONTRIBUTING.md`,
    sourceLabel: `the notes for contributors, ${IN_REPO}`,
    checked: CHECKED,
  },
  // Workbenches
  {
    id: 'bench-public',
    about: 'app',
    text: 'Three workbenches are built with the app and published beside it: the galaxy renderer at /galaxy/, the MCPM workbench at /mcpm/ and the flow workbench at /flow/.',
    source: TOOL_PAGES,
    sourceLabel: `the list of pages built beside the app, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'bench-public-data',
    about: 'app',
    text: 'A published workbench loads the same data files as the published app, from the same host.',
    source: DEPLOY,
    sourceLabel: `the notes on publishing, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'bench-local',
    about: 'app',
    text: 'The scene workbench and the named-galaxy curator are not published. Each runs from a copy of the repository, on a port of its own, and reads and writes files on that machine.',
    source: `${REPO_BLOB}/tools/utils/io/devPorts.ts`,
    sourceLabel: `the table of ports, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'bench-not-app',
    about: 'app',
    text: 'A workbench is a small app of its own: none of its code is in what a visitor to skymap downloads.',
    source: `${REPO_BLOB}/tools/galaxy-renderer/README.md`,
    sourceLabel: `the galaxy renderer’s manual, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'bench-galaxy-unused',
    about: 'app',
    text: 'The app does not draw any galaxy with the galaxy renderer’s model yet. Drawing the Milky Way with it is on the list of planned work.',
    source: BACKLOG,
    sourceLabel: BACKLOG_LABEL,
    checked: CHECKED,
  },
  // Command-line tools
  {
    id: 'cli-scripts',
    about: 'app',
    text: `Every command is a script in the package.json at the root of the repository, run as npm run and its name. They need Node ${pkg.engines.node.replace('>=', '')} or later.`,
    source: `${REPO_BLOB}/package.json`,
    sourceLabel: `package.json, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'cli-arguments',
    about: 'app',
    text: 'What follows a bare -- on the command line is handed to the tool.',
    source: `${REPO_BLOB}/tools/shot/README.md`,
    sourceLabel: `the manual of the shot tool, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'cli-running-app',
    about: 'app',
    text: 'perf, capture-featured, site:shots and site:loops drive an app that is already running, and take its address after --url; so do record-tour and record-clip unless they are given --serve. shot starts one itself when it is given no address.',
    source: `${REPO_BLOB}/tools/perf/README.md`,
    sourceLabel: `the manual of the perf tool, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'cli-unlisted-deploy',
    about: 'app',
    text: 'Four scripts publish the app and its data: deploy, sync-r2, sync-r2-secure and r2-cors. They need the owner’s keys.',
    source: DEPLOY,
    sourceLabel: `the notes on publishing, ${IN_REPO}`,
    checked: CHECKED,
  },
  // Debug panel and flags
  {
    id: 'debug-open',
    about: 'app',
    text: 'The D key opens a panel headed “Skymap Debug” at the right of the window, and closes it. It is in the published app and needs no flag. No button opens it, so it needs a keyboard. It does not show while the welcome screen, a tour or an exhibit is up or the interface is hidden, nor with cinema in the address.',
    source: `${REPO_BLOB}/src/state/input/keyboardShortcuts.ts`,
    sourceLabel: `the keyboard shortcuts, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'debug-not-kept',
    about: 'app',
    text: 'Nothing changed in the panel is kept: a reload puts every slider and switch back.',
    source: `${REPO_BLOB}/src/state/settings/initialSettings.ts`,
    sourceLabel: `the app’s first settings, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'debug-timings',
    about: 'app',
    text: 'The time the graphics processor takes is measured only when the address carries gpuTimings or perf, and only where the browser offers timestamp queries. The line of frames a second and script time needs neither.',
    source: `${REPO_BLOB}/src/services/engine/phases/initGpu.ts`,
    sourceLabel: `the start of the graphics device, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'debug-hook',
    about: 'app',
    text: 'On every page load the app sets window.__skymap, an object our own tools drive it through: the store’s dispatch and getState, and three promises, for the app being ready, for the next frame, and for a frame with nothing still fading in.',
    source: `${REPO_BLOB}/src/state/automation/installSkymapHook.ts`,
    sourceLabel: `the hook for tools, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'debug-hook-modes',
    about: 'app',
    text: 'With perf in the address the app also sets window.__skymapPerf, for the perf tool, and with cinema window.__skymapRecorder, for the film recorder.',
    source: `${REPO_BLOB}/src/state/perf/installPerfHook.ts`,
    sourceLabel: `the hook of the perf tool, ${IN_REPO}`,
    checked: CHECKED,
  },
];
