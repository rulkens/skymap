/**
 * groupPhotoPoses — one group's harvested skråfoto frames as the `PhotoPose[]`
 * a known-pose reconstruction is injected with, paired with the STAC items that
 * produced them. Every bake that writes a COLMAP model (`bakeSplats`,
 * `bakeMesh`) derives its poses here, so they can never disagree about the crop,
 * the intrinsics, or which frames were dropped.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { frameWindow, frameWindowOutputPx } from './frameWindow';
import { photoPoseFromStacItem } from './photoPoseFromStacItem';
import { topocentricPositionsM, type CctRunner } from './topocentricPositionsM';
import { jpegSizePx } from '../../utils/io/jpegSizePx';
import { rawDataPath } from '../../utils/io/rawDataRegistry';
import { readStacItems } from '../../utils/skraafoto/readStacItems';
import { skraafotoHarvestDir } from '../../utils/skraafoto/skraafotoHarvestDir';
import type { SceneGroupDefinition } from '../@types/SceneGroupDefinition';
import type { SkraafotoStacItem } from '../@types/SkraafotoStacItem';
import type { PhotoPose } from '../../scene-workbench/@types/PhotoPose';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export async function groupPhotoPoses(
  group: SceneGroupDefinition,
  deps: { readonly runCct: CctRunner },
): Promise<{
  readonly poses: readonly PhotoPose[];
  readonly items: readonly SkraafotoStacItem[];
  readonly harvestDir: string;
}> {
  const harvestDir = skraafotoHarvestDir(rawDataPath('skraafoto.dir'), group);
  const harvested = await readStacItems(harvestDir);
  if (harvested.length === 0) {
    throw new Error(
      `scene-recon: no STAC items in ${harvestDir} — run ` +
        `\`npm run fetch-skraafoto -- --group ${group.id}\` first.`,
    );
  }

  const centresUtm: Vec3[] = harvested.map((item) => [
    ...item.properties['pers:perspective_center'],
  ]);
  const positions = await topocentricPositionsM(group.anchor, centresUtm, {
    runCct: deps.runCct,
  });

  const poses: PhotoPose[] = [];
  const items: SkraafotoStacItem[] = [];
  let skipped = 0;
  for (const [i, item] of harvested.entries()) {
    // Recomputed, not read from a sidecar: the harvest wrote whatever this
    // same function said, so a group whose bounds or resolution moved since
    // fails the dimension check below rather than training on stale pixels.
    const window = frameWindow(item, group, positions[i]!);
    if (window === null) {
      skipped++;
      continue;
    }
    const pose = photoPoseFromStacItem(item, group.anchor, positions[i]!, window);
    // photoPoseFromStacItem names the JPEG bare and writeColmapModel hands
    // `imageUrl` straight to `copyFile`, which resolves against cwd — so the
    // harvest directory has to be folded in here or the copy misses.
    const imageUrl = join(harvestDir, pose.imageUrl);
    await assertJpegMatchesWindow(imageUrl, frameWindowOutputPx(window), group.id);
    poses.push({ ...pose, imageUrl });
    items.push(item);
  }
  if (poses.length === 0) {
    throw new Error(
      `scene-recon: none of the ${harvested.length} harvested frame(s) see group "${group.id}" — ` +
        'its bounds moved since the harvest.',
    );
  }
  if (skipped > 0) {
    process.stderr.write(`scene-recon: ${skipped} harvested frame(s) no longer see the bounds\n`);
  }

  return { poses, items, harvestDir };
}

/** The harvest carries no record of the window it was cut with, so the JPEG's
 *  own dimensions are the check that it still matches the group. */
async function assertJpegMatchesWindow(
  jpegPath: string,
  expectedPx: readonly [number, number],
  groupId: string,
): Promise<void> {
  const bytes = await readFile(jpegPath).catch(() => {
    throw new Error(
      `scene-recon: ${jpegPath} is missing — re-run \`npm run fetch-skraafoto -- --group ${groupId}\`.`,
    );
  });
  const [width, height] = jpegSizePx(bytes);
  if (width !== expectedPx[0] || height !== expectedPx[1]) {
    throw new Error(
      `scene-recon: ${jpegPath} is ${width}×${height}, but group "${groupId}" now wants ` +
        `${expectedPx[0]}×${expectedPx[1]} — its bounds or groundMmPerPx changed since the ` +
        `harvest. Delete the harvest directory and re-run ` +
        `\`npm run fetch-skraafoto -- --group ${groupId}\`.`,
    );
  }
}
