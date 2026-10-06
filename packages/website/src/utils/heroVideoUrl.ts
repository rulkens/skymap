import { HERO_MEDIA } from '../../../../tools/site/heroMediaPlan';
import { dataBaseUrl } from '../../../../src/utils/network/dataBaseUrl';

/**
 * Where the scrub video is served. Dev: the repo's `public/data/site/` at the
 * root (base is empty). Production: the data host, from the same
 * `VITE_DATA_BASE_URL` the app reads (`vite.envDir` points Astro at the repo
 * root's `.env.production`), so the host is written in one place.
 */
export function heroVideoUrl(): string {
  return `${dataBaseUrl()}/data/site/${HERO_MEDIA.videoFile}`;
}
