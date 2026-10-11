/**
 * capture — writes one thumbnail per capturable palette card and per cosmic
 * featured structure, by mapping each target onto a `SceneShot` and handing it
 * to the generic capturer. The targets carry their own output path, so this
 * file never branches on which kind it is writing.
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { launchChromium } from '../utils/browser/launchChromium';
import { captureScene } from '../utils/capture/captureScene';
import { WARN_BYTES } from '../utils/capture/shotDefaults';
import { selectCaptureTargets } from './selectCaptureTargets';
import { parseArgs } from './parseFeaturedArgs';
import { DEFAULT_CAPTURE_T, OUTPUT_DIR, STRUCTURE_OUTPUT_DIR } from './featuredDefaults';
import { featuredAnchorsOfScale } from './featuredAnchorsOfScale';
import { FEATURED_TABS } from '../../src/data/palette/featuredTabs';
import type { CaptureTarget } from './@types/CaptureTarget';
import type { SceneShot } from '../@types/capture/SceneShot';

function shotFor(target: CaptureTarget): SceneShot {
  // An exhibit card boots on `#exhibit=<id>` — its registry settings and
  // pose apply themselves, the same arrival a deep link gets; a focus card
  // boots on `#focus=`. A pose card (a tour) has neither, so `capture.pose`
  // below is its only framing.
  return {
    focusId: target.kind === 'focus' ? target.focusId : undefined,
    exhibitId: target.kind === 'exhibit' ? target.exhibitId : undefined,
    settings: target.capture.settings,
    t: target.capture.t ?? DEFAULT_CAPTURE_T,
    pose: target.capture.pose,
    phaseDeg: target.capture.phaseDeg,
    keepFocus: target.capture.keepFocus,
    hideGalaxyField: target.capture.hideGalaxyField,
    outPath: target.outPath,
    label: target.cardId,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const existing = new Set<string>();
  for (const dir of [OUTPUT_DIR, STRUCTURE_OUTPUT_DIR]) {
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.webp')) existing.add(`${dir}/${name}`);
    }
  }
  const structureIds = featuredAnchorsOfScale('cosmic').map((s) => s.id);
  const targets = selectCaptureTargets(FEATURED_TABS, structureIds, existing, options.force);
  console.log(`capture-featured: ${targets.length} target(s)`);
  if (targets.length === 0) return;

  const failed: { label: string; reason: string }[] = [];
  const warnings: string[] = [];
  let captured = 0;

  const browser = await launchChromium();
  try {
    for (const target of targets) {
      const outcome = await captureScene(browser, options.url, shotFor(target));
      if (outcome.status === 'failed') {
        console.error(`  ${outcome.label} FAILED: ${outcome.reason}`);
        failed.push(outcome);
        continue;
      }
      const kb = outcome.bytes / 1024;
      console.log(`  ${outcome.label}: ${kb.toFixed(1)} KB`);
      if (outcome.bytes > WARN_BYTES) {
        warnings.push(`${outcome.label}: ${kb.toFixed(1)} KB (> ${WARN_BYTES / 1024} KB)`);
      }
      captured += 1;
    }
  } finally {
    await browser.close();
  }

  console.log(`\ncaptured ${captured}/${targets.length}`);
  if (warnings.length > 0) {
    console.log('warnings:');
    for (const w of warnings) console.log(`  ${w}`);
  }
  if (failed.length > 0) {
    console.log('failed:');
    for (const f of failed) console.log(`  ${f.label}: ${f.reason}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
