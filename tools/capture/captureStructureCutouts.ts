/**
 * captureStructureCutouts — writes the shot of every featured anchor that
 * `structureShotSource` sends to a sky cutout (Milky Way structures and
 * compact galaxy clusters and groups), since the app's own render of those is
 * a handful of points. The rest are shot from the app by `capture.ts`.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { writeThumbnail } from '../utils/capture/writeThumbnail';
import { featuredAnchorsByShotSource } from './featuredAnchorsByShotSource';
import { STRUCTURE_OUTPUT_DIR } from './featuredDefaults';
import { parseArgs } from './parseFeaturedArgs';
import { structureCutoutUrl } from './structureCutoutUrl';

const DELAY_MS = 500;

async function fetchJpeg(url: string): Promise<Buffer> {
  const res = await fetch(url);
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) {
    throw new Error(`${res.status} ${type || 'no content-type'} from ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  const { force } = parseArgs(process.argv.slice(2));
  const anchors = featuredAnchorsByShotSource('cutout');
  for (const id of force) {
    if (!anchors.some((s) => s.id === id))
      throw new Error(`--force '${id}' is not a cutout anchor`);
  }
  mkdirSync(STRUCTURE_OUTPUT_DIR, { recursive: true });
  const todo = anchors.filter(
    (s) => force.includes(s.id) || !existsSync(`${STRUCTURE_OUTPUT_DIR}/${s.id}.webp`),
  );
  console.log(`capture-structures: ${todo.length} target(s)`);

  const failed: string[] = [];
  for (const s of todo) {
    try {
      const kb =
        (await writeThumbnail(
          await fetchJpeg(structureCutoutUrl(s)),
          `${STRUCTURE_OUTPUT_DIR}/${s.id}.webp`,
        )) / 1024;
      console.log(`  ${s.id}: ${kb.toFixed(1)} KB`);
    } catch (err) {
      console.error(`  ${s.id} FAILED: ${err instanceof Error ? err.message : String(err)}`);
      failed.push(s.id);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
