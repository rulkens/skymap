/**
 * captureFeatured — writes one thumbnail per capturable palette card, by mapping
 * each card onto a `SceneShot` and handing it to the generic capturer. This is
 * the only file here that knows what a palette card is.
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { launchChromium } from '../utils/browser/launchChromium';
import { captureScene } from '../utils/capture/captureScene';
import { WARN_BYTES } from '../utils/capture/shotDefaults';
import { selectCaptureTargets } from './selectCaptureTargets';
import { parseArgs } from './parseFeaturedArgs';
import { DEFAULT_CAPTURE_T, OUTPUT_DIR } from './featuredDefaults';
import { FEATURED_TABS } from '../../src/data/palette/featuredTabs';
import type { CaptureTarget } from './CaptureTarget';
import type { SceneShot } from '../utils/capture/SceneShot';

function shotFor(target: CaptureTarget): SceneShot {
  return {
    focusId: target.focusId,
    t: target.capture.t ?? DEFAULT_CAPTURE_T,
    pose: target.capture.pose,
    phaseDeg: target.capture.phaseDeg,
    keepFocus: target.capture.keepFocus,
    hideGalaxyField: target.capture.hideGalaxyField,
    outPath: `${OUTPUT_DIR}/${target.cardId}.webp`,
    label: target.cardId,
  };
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
