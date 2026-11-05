import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StructureAuditData } from './@types/StructureAuditData';

/** The static page with the data literal spliced in; `</script>` inside JSON is neutralised. */
export function renderPage(data: StructureAuditData): string {
  const template = readFileSync(join(import.meta.dirname, 'page', 'structureAudit.html'), 'utf8');
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');
  return template.replace('__GENERATED__', data.generated).replace('__DATA__', () => json);
}
