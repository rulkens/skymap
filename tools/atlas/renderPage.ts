import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AtlasData } from './types/AtlasData';

/** The static page with the data literal spliced in; `</script>` inside JSON is neutralised. */
export function renderPage(data: AtlasData): string {
  const template = readFileSync(join(import.meta.dirname, 'page', 'atlas.html'), 'utf8');
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');
  return template.replace('__GENERATED__', data.generated).replace('__DATA__', () => json);
}
