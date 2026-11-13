/** Data-relative path of one dated, never-overwritten file of a live dataset. */
export function liveFilePath(id: string, date: string, name: string): string {
  return `live/v1/files/${id}/${date}/${name}`;
}
