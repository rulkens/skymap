import type { SceneManifest } from '../../scene-workbench/@types/SceneManifest';
import type { SceneAsset } from '../../scene-workbench/@types/SceneAsset';

/** Replaces the asset sharing `asset.id` in place, or appends it. Siblings
 *  are returned by the same reference — a re-read manifest's untouched
 *  assets must stay `===` so a diff of the written file shows only the
 *  one asset that actually changed. */
export function upsertAsset(manifest: SceneManifest, asset: SceneAsset): SceneManifest {
  const index = manifest.assets.findIndex((existing) => existing.id === asset.id);
  const assets =
    index === -1
      ? [...manifest.assets, asset]
      : manifest.assets.map((existing, i) => (i === index ? asset : existing));

  return { ...manifest, assets };
}
