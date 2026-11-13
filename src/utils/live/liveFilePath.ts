/** Data-relative path of one dated, never-overwritten file; `stamp` comes from `liveFolderStamp`. */
export function liveFilePath(id: string, stamp: string, name: string): string {
  return `live/v1/files/${id}/${stamp}/${name}`;
}
