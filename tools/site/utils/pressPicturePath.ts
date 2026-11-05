import type { PressPicture } from '../../../packages/website/src/@types/PressPicture';

/** Where a press picture sits in the kit's zip. */
export function pressPicturePath(row: PressPicture): string {
  return `pictures/${row.file}.jpg`;
}
