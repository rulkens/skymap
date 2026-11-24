import type { Finding } from '../../@types/refactor/Finding';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';

/**
 * Quoted occurrences of `prop` in files that mention `typeName`, minus known references.
 * `Pick<Shape, 'radius'>` and `key === 'radius'` name the property without the engine
 * seeing it, so they are surfaced for a human; files that never name the type are skipped
 * because a bare string is otherwise far too common to be worth a line.
 */
export function findQuotedMentions(input: {
  typeName: string;
  prop: string;
  texts: ReadonlyMap<string, string>;
  known: readonly NodeLocation[];
}): readonly Finding[] {
  const { typeName, prop, texts, known } = input;
  const mentionsType = new RegExp(`(?<![\\w$])${escape(typeName)}(?![\\w$])`);
  const quoted = new RegExp(`(['"\`])${escape(prop)}\\1`, 'g');
  const found: Finding[] = [];
  for (const [file, text] of texts) {
    if (!mentionsType.test(text)) continue;
    for (const match of text.matchAll(quoted)) {
      const start = match.index + 1;
      if (known.some((ref) => ref.file === file && ref.start === start)) continue;
      const line = text.slice(0, start).split('\n').length;
      found.push({
        file,
        line,
        message: `'${prop}' as a string: not a tracked reference, check by hand`,
      });
    }
  }
  return found;
}

function escape(word: string): string {
  return word.replace(/[$]/g, '\\$&');
}
