/** Every file a stylesheet references through `composes … from` or `@import`. */
import { readFileSync } from 'node:fs';
import { cssStatements } from './cssStatements';

const CSS_REFERENCE = /^(?:composes\s*:.*\sfrom|@import)\s+(?:url\()?(['"])(.+?)\1/s;

export function cssSpecifiers(file: string): string[] {
  return cssStatements(readFileSync(file, 'utf8'))
    .filter((statement) => statement.kind === 'declaration')
    .map((statement) => CSS_REFERENCE.exec(statement.text)?.[2])
    .filter((spec): spec is string => spec !== undefined);
}
