/** Strip a stack-frame source URL down to its bare filename: query string,
 *  directories, and extension all go. Vite dev serves e.g.
 *  `http://localhost:5173/src/a/b/catalogStore.ts?t=169...` → `catalogStore`. */
export function basenameOfSourceUrl(url: string): string {
  const withoutQuery = url.split('?')[0] ?? url;
  const lastSegment = withoutQuery.split('/').pop() ?? withoutQuery;
  return lastSegment.replace(/\.[^.]+$/, '');
}
