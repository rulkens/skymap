import { dataBaseUrl } from '../../../../src/utils/network/dataBaseUrl';
import pressKit from '../data/pressKit.json';

/** Where the press kit's zip is served: the data host in production, the repo's `public/data/site/` in dev, as heroVideoUrl. */
export function pressKitUrl(): string {
  return `${dataBaseUrl()}/data/site/${pressKit.file}`;
}
