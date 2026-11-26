import ts from 'typescript';

/**
 * The text of one destructured object parameter standing for the whole parameter list
 * `text[params.start, params.end)`: `width: number, height: number = 2, label?: string`
 * becomes `{ width, height = 2, label }: { width: number; height?: number; label?: string }`.
 * The names are unchanged so the function body keeps working untouched. A parameter whose
 * type would have to be inferred (no annotation) refuses, since the new inline type has to
 * spell it out.
 */
export function objectParamText(
  text: string,
  params: { start: number; end: number },
): { ok: true; text: string; names: readonly string[] } | { ok: false; refusal: string } {
  const wrapped = `(${text.slice(params.start, params.end)}) => 0`;
  const source = ts.createSourceFile('params.ts', wrapped, ts.ScriptTarget.Latest, true);
  const arrow = (source.statements[0] as ts.ExpressionStatement | undefined)?.expression;
  if (!arrow || !ts.isArrowFunction(arrow)) {
    return { ok: false, refusal: 'the parameter list does not parse.' };
  }
  const list = arrow.parameters;
  if (list.length < 2) return { ok: false, refusal: 'nothing to gain: fewer than two parameters.' };

  const slice = (node: ts.Node) => wrapped.slice(node.getStart(source), node.getEnd());
  const names: string[] = [];
  const bindings: string[] = [];
  const members: string[] = [];
  for (const param of list) {
    const label = slice(param);
    if (param.dotDotDotToken) return { ok: false, refusal: `'${label}' is a rest parameter.` };
    if (!ts.isIdentifier(param.name)) {
      return { ok: false, refusal: `'${label}' is already a destructured parameter.` };
    }
    const name = param.name.text;
    if (name === 'this') return { ok: false, refusal: `'${label}' is a this parameter.` };
    if (!param.type) {
      return {
        ok: false,
        refusal: `'${label}' has no type annotation: its type would have to be inferred.`,
      };
    }
    names.push(name);
    bindings.push(param.initializer ? `${name} = ${slice(param.initializer)}` : name);
    const optional = param.questionToken || param.initializer ? '?' : '';
    members.push(`${name}${optional}: ${slice(param.type)}`);
  }
  return {
    ok: true,
    text: `{ ${bindings.join(', ')} }: { ${members.join('; ')} }`,
    names,
  };
}
