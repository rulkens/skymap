/** The fields of one `rclone lsjson --hash --hash-type MD5` entry the sync reads. */
export type LsjsonEntry = {
  readonly Path: string;
  readonly IsDir: boolean;
  readonly Hashes?: { readonly md5?: string };
};
