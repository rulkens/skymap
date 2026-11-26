/** The dated folder's name: the build's UTC time to the minute, `2026-11-13T0423Z`, so a rerun never reuses a key. */
export function liveFolderStamp(builtAt: Date): string {
  const iso = builtAt.toISOString();
  return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
}
