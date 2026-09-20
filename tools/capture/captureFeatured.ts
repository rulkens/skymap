/**
 * captureFeatured — drives a running dev server headlessly and writes one
 * thumbnail per capturable palette card to `public/images/featured/<id>.webp`.
 * Order matters: declutter → settle → pose (landmine: a focus fly-in
 * overwrites an early `setPose`) → clear focus → verify → screenshot.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import type { Browser, ConsoleMessage, Page } from '@playwright/test';
import type { UnknownAction } from '@reduxjs/toolkit';
import sharp from 'sharp';
import { launchChromium } from '../utils/browser/launchChromium';
import { bootHookedPage } from '../utils/browser/bootHookedPage';
import { collectPageErrors } from '../utils/browser/collectPageErrors';
import { selectCaptureTargets } from '../utils/capture/selectCaptureTargets';
import { poseMismatch } from '../utils/capture/poseMismatch';
import { bodyPhasePose } from '../utils/capture/bodyPhasePose';
import type { CaptureTarget } from '../utils/capture/CaptureTarget';
import { CAPTURE_HIDDEN_PASSES } from './captureHiddenPasses';
import { FEATURED_TABS } from '../../src/data/palette/featuredTabs';
import { GALAXY_CATALOG_IDS } from '../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STAR_CATALOG_IDS } from '../../src/data/starCatalog/starCatalogIds';
import { STRUCTURE_IDS } from '../../src/data/structure/structureIds';
import { BODY_IDS } from '../../src/data/bodies/bodyIds';
import {
  setGalaxyCatalogLabelEnabled,
  setGalaxyCatalogVisible,
} from '../../src/layers/galaxyCatalog/settings/galaxyCatalogsSlice';
import { setStarCatalogLabelEnabled } from '../../src/layers/starCatalog/settings/starCatalogsSlice';
import {
  setStructureItemEnabled,
  setStructureLabelEnabled,
} from '../../src/layers/structure/settings/structuresSlice';
import { setBodyLabelEnabled } from '../../src/layers/body/settings/bodiesSlice';
import { setMilkyWayLabelEnabled } from '../../src/layers/milkyWay/settings/milkyWaySlice';
import { setOrbitTrailsEnabled } from '../../src/layers/body/settings/orbitTrailsSlice';
import { setPassDisabled } from '../../src/state/settings/core/debugSlice';
import { logCameraState } from '../../src/state/camera/logCameraState';
import { DEFAULT_FOV_DEG } from '../../src/data/defaults';
import { cameraRoute, engineRoute } from '../../src/store/constants';
import type { CameraPose } from '../../src/@types/camera/CameraPose';
import type { RootState } from '../../src/store/types';
import type { SkymapPerfHook } from '../../src/@types/perf/SkymapPerfHook';
import type { GalaxyCatalogId } from '../../src/@types/data/galaxyCatalog/GalaxyCatalogId';

const FAMOUS_GALAXY_CATALOG: GalaxyCatalogId = 'famousGalaxy';

const VIEWPORT = { width: 900, height: 900 };
// A grid card is ~101 CSS px wide (560px panel, minus border/padding/gaps over
// 5 columns) — 204 is ×2 for retina.
const OUTPUT_PX = 204;
const WEBP_QUALITY = 82; // the famous-curator's setting; lands ~10-20 KB
const WARN_BYTES = 40 * 1024;
const SETTLE_HOLD_MS = 1000;
const SETTLE_POLL_MS = 250;
const SETTLE_TIMEOUT_MS = 90_000;
const POST_ESC_WAIT_MS = 1500;
const CAMERA_LOG_TIMEOUT_MS = 15_000;
// The capture-spike day: keeps the framed poses (13:00, 12:56) lit consistently.
const DEFAULT_CAPTURE_T = '2026-09-18T12:00:00Z';
// A phase pose frames the body from its angular size, so it must assume the
// same field of view the capture runs at — the app's default, never touched here.
const DEFAULT_FOV_Y_RAD = (DEFAULT_FOV_DEG * Math.PI) / 180;
const OUTPUT_DIR = 'public/images/featured';

type CaptureOptions = { url: string; force: string[] };

function parseArgs(argv: readonly string[]): CaptureOptions {
  const options: CaptureOptions = { url: 'http://localhost:5173', force: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--url') {
      const value = argv[++i];
      if (value === undefined) throw new Error('--url requires a value');
      const base = value.replace(/\/+$/, '');
      if (base.includes('?') || base.includes('#')) {
        throw new Error(`--url must not carry its own query or hash (got '${value}')`);
      }
      options.url = base;
    } else if (arg === '--force') {
      const ids: string[] = [];
      while (i + 1 < argv.length && !(argv[i + 1] ?? '').startsWith('--')) {
        ids.push(argv[++i] as string);
      }
      if (ids.length === 0) throw new Error('--force requires at least one card id');
      options.force.push(...ids);
    } else {
      throw new Error(`unknown flag '${arg}' (known: --url, --force)`);
    }
  }
  return options;
}

/**
 * Every label off, structure rings and orbit trails off, and — for a card that
 * asks — the survey point clouds off, as per-row actions rather than a settings
 * snapshot, so the tool states exactly what it hides.
 */
function declutterActions(hideGalaxyField: boolean): UnknownAction[] {
  return [
    ...GALAXY_CATALOG_IDS.flatMap((id) => [
      setGalaxyCatalogLabelEnabled({ id, enabled: false }),
      // `famousGalaxy` is a catalog row like the surveys, but it draws the
      // subject of a galaxy card — hiding "the field" must never hide it.
      ...(hideGalaxyField && id !== FAMOUS_GALAXY_CATALOG
        ? [setGalaxyCatalogVisible({ id, enabled: false })]
        : []),
    ]),
    ...STAR_CATALOG_IDS.map((id) => setStarCatalogLabelEnabled({ id, enabled: false })),
    ...STRUCTURE_IDS.flatMap((id) => [
      setStructureLabelEnabled({ id, enabled: false }),
      setStructureItemEnabled({ id, enabled: false }),
    ]),
    ...BODY_IDS.map((id) => setBodyLabelEnabled({ id, enabled: false })),
    setMilkyWayLabelEnabled(false),
    setOrbitTrailsEnabled(false),
  ];
}

async function declutter(page: Page, hideGalaxyField: boolean): Promise<void> {
  const passActions = CAPTURE_HIDDEN_PASSES.map((pass) =>
    setPassDisabled({ pass, disabled: true }),
  );
  await page.evaluate(
    (actions) => {
      const h = (window as unknown as { __skymapPerf: SkymapPerfHook }).__skymapPerf;
      for (const action of actions) h.dispatch(action);
    },
    [...declutterActions(hideGalaxyField), ...passActions],
  );
}

async function waitSettled(page: Page, cardId: string): Promise<void> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let settledSince: number | null = null;
  for (;;) {
    const settled = await page.evaluate(
      ({ cameraKey, engineKey }) => {
        const h = (window as unknown as { __skymapPerf: SkymapPerfHook }).__skymapPerf;
        // Typed against the real store: these four field names are the whole
        // settle contract, and an unchecked read of a renamed one is silently
        // never-settled — 90 s per card, blaming the wrong thing.
        const state = h.getState() as unknown as RootState;
        const camera = state[cameraKey];
        const busy = camera.clip !== null || camera.tween !== null || camera.frameTween !== null;
        const loading = state[engineKey].loadProgress !== null;
        return !busy && !loading;
      },
      { cameraKey: cameraRoute, engineKey: engineRoute },
    );
    if (settled) {
      settledSince ??= Date.now();
      if (Date.now() - settledSince >= SETTLE_HOLD_MS) return;
    } else {
      settledSince = null;
    }
    if (Date.now() > deadline) {
      throw new Error(`card '${cardId}' never settled within ${SETTLE_TIMEOUT_MS} ms`);
    }
    await page.waitForTimeout(SETTLE_POLL_MS);
  }
}

async function applyPose(page: Page, pose: CameraPose): Promise<void> {
  await page.evaluate((p) => {
    const h = (window as unknown as { __skymapPerf: SkymapPerfHook }).__skymapPerf;
    return h.setPose({
      target: p.target,
      yaw: p.yaw,
      pitch: p.pitch,
      distance: p.distance,
      rate: 0,
    });
  }, pose);
}

/**
 * Dispatches the `l`-key action and reads the resulting `[engine] camera
 * state (full precision)` console line's second argument — the raw JSON blob
 * `logCameraState` prints — rather than string-matching the formatted line.
 */
async function readLiveCameraState(
  page: Page,
): Promise<Pick<CameraPose, 'yaw' | 'pitch' | 'distance'>> {
  const messagePromise = new Promise<ConsoleMessage>((resolve, reject) => {
    const onMessage = (msg: ConsoleMessage): void => {
      if (msg.text().includes('camera state (full precision)')) {
        page.off('console', onMessage);
        clearTimeout(timer);
        resolve(msg);
      }
    };
    // Bounded like every other wait here: if the `l`-key log stops arriving —
    // unwired saga, renamed line — the card fails and the run goes on, rather
    // than the whole run hanging on one silent page.
    const timer = setTimeout(() => {
      page.off('console', onMessage);
      reject(new Error(`no camera state logged within ${CAMERA_LOG_TIMEOUT_MS} ms`));
    }, CAMERA_LOG_TIMEOUT_MS);
    page.on('console', onMessage);
  });
  await page.evaluate((action) => {
    (window as unknown as { __skymapPerf: SkymapPerfHook }).__skymapPerf.dispatch(action);
  }, logCameraState());
  const msg = await messagePromise;
  const jsonArg = msg.args()[1];
  if (jsonArg === undefined) {
    throw new Error('camera state console message carried no JSON argument');
  }
  const parsed = JSON.parse((await jsonArg.jsonValue()) as string) as {
    yaw: number;
    pitch: number;
    distanceMpc: number;
  };
  const live = { yaw: parsed.yaw, pitch: parsed.pitch, distance: parsed.distanceMpc };
  // LANDMINE: `poseMismatch` compares with `>`, and every comparison against a
  // NaN is false — a renamed key here would turn the verification step into a
  // silent pass, shipping whatever the fly-in happened to leave on screen.
  for (const [field, value] of Object.entries(live)) {
    if (!Number.isFinite(value)) {
      throw new Error(`camera state '${field}' came back as ${String(value)}, not a number`);
    }
  }
  return live;
}

type RunAccumulator = {
  captured: string[];
  failed: { cardId: string; reason: string }[];
  warnings: string[];
};

async function captureCard(
  browser: Browser,
  base: string,
  target: CaptureTarget,
  acc: RunAccumulator,
): Promise<void> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = collectPageErrors(page);
  try {
    const t = target.capture.t ?? DEFAULT_CAPTURE_T;
    if (target.capture.pose !== undefined && target.capture.phaseDeg !== undefined) {
      throw new Error(
        `card '${target.cardId}' sets both 'pose' and 'phaseDeg' — phaseDeg computes one`,
      );
    }
    const pose =
      target.capture.phaseDeg === undefined
        ? target.capture.pose
        : bodyPhasePose(target.focusId, t, target.capture.phaseDeg, DEFAULT_FOV_Y_RAD);
    const url = `${base}/?perf&cinema#focus=${target.focusId}&t=${t}`;
    await bootHookedPage(page, url, '__skymapPerf');

    await declutter(page, target.capture.hideGalaxyField === true);
    await waitSettled(page, target.cardId);

    if (pose !== undefined) {
      await applyPose(page, pose);
      await waitSettled(page, target.cardId);
    }

    if (target.capture.keepFocus !== true) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(POST_ESC_WAIT_MS);
    }

    if (pose !== undefined) {
      let live = await readLiveCameraState(page);
      if (poseMismatch(pose, live).length > 0) {
        await applyPose(page, pose);
        await waitSettled(page, target.cardId);
        live = await readLiveCameraState(page);
        const mismatches = poseMismatch(pose, live);
        if (mismatches.length > 0) {
          throw new Error(
            `card '${target.cardId}' pose mismatch on [${mismatches.join(', ')}] — ` +
              `requested ${JSON.stringify(pose)}, live ${JSON.stringify(live)}`,
          );
        }
      }
    }

    const png = await page.screenshot({ type: 'png' });
    const webp = await sharp(png)
      .resize(OUTPUT_PX, OUTPUT_PX)
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    writeFileSync(`${OUTPUT_DIR}/${target.cardId}.webp`, webp);
    const kb = webp.length / 1024;
    console.log(`  ${target.cardId}: ${kb.toFixed(1)} KB`);
    if (webp.length > WARN_BYTES) {
      acc.warnings.push(`${target.cardId}: ${kb.toFixed(1)} KB (> ${WARN_BYTES / 1024} KB)`);
    }
    acc.captured.push(target.cardId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`  ${target.cardId} FAILED: ${reason}`);
    if (pageErrors.length > 0) console.error(`    page errors: ${pageErrors.join('; ')}`);
    acc.failed.push({ cardId: target.cardId, reason });
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const existing = new Set(
    readdirSync(OUTPUT_DIR)
      .filter((name) => name.endsWith('.webp'))
      .map((name) => name.slice(0, -'.webp'.length)),
  );
  const targets = selectCaptureTargets(FEATURED_TABS, existing, options.force);
  console.log(`capture-featured: ${targets.length} target(s)`);
  if (targets.length === 0) return;

  const acc: RunAccumulator = { captured: [], failed: [], warnings: [] };
  const browser = await launchChromium();
  try {
    for (const target of targets) {
      await captureCard(browser, options.url, target, acc);
    }
  } finally {
    await browser.close();
  }

  console.log(`\ncaptured ${acc.captured.length}/${targets.length}`);
  if (acc.warnings.length > 0) {
    console.log('warnings:');
    for (const w of acc.warnings) console.log(`  ${w}`);
  }
  if (acc.failed.length > 0) {
    console.log('failed:');
    for (const f of acc.failed) console.log(`  ${f.cardId}: ${f.reason}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
