/** Data-relative path of a live dataset's pointer; `v1/` is the version gate. */
export function livePointerPath(id: string): string {
  return `live/v1/${id}.json`;
}
