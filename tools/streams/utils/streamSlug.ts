/** The stream's URL id: lowercase, each run of non-alphanumerics one '-' ('GD-1' → 'gd-1'). */
export function streamSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
