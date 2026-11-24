import ts from 'typescript';
import type { Finding } from '../../@types/refactor/Finding';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import { isTypeScriptFile } from './isTypeScriptFile';
import { parseTs } from './parseTs';

/**
 * Quoted occurrences of `prop` that name the property without the engine seeing it, minus
 * known references. Only two shapes count, because a bare string equal to a property name
 * is far too common to list: a string-literal type (`Pick<Shape, 'radius'>`, a union of
 * keys) in a file that names the type, and a string expression in a file that writes
 * `keyof Shape`, where the string is presumably compared with or indexed by such a key.
 */
export function findQuotedMentions(input: {
  typeName: string;
  prop: string;
  texts: ReadonlyMap<string, string>;
  known: readonly NodeLocation[];
}): readonly Finding[] {
  const { typeName, prop, texts, known } = input;
  const word = `(?<![\\w$])${typeName.replace(/[$]/g, '\\$&')}(?![\\w$])`;
  const mentionsType = new RegExp(word);
  const usesKeyof = new RegExp(`keyof\\s+${word}`);
  const found: Finding[] = [];
  for (const [file, text] of texts) {
    if (!isTypeScriptFile(file) || !text.includes(prop) || !mentionsType.test(text)) continue;
    const keyof = usesKeyof.test(text);
    const source = parseTs(file, text);
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) && node.text === prop) {
        const start = node.getStart(source) + 1;
        const counts = ts.isLiteralTypeNode(node.parent) || keyof;
        if (counts && !known.some((ref) => ref.file === file && ref.start === start)) {
          found.push({
            file,
            line: source.getLineAndCharacterOfPosition(start).line + 1,
            message: `'${prop}' as a string: not a tracked reference, check by hand`,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}
