import ts from 'typescript';

/**
 * Is there a comment before, between or after the parameters, outside their own text?
 * The parameter list is replaced by one destructured object, so such a comment would be
 * lost or end up describing something else.
 */
export function hasCommentAmongParams(
  text: string,
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
): boolean {
  let at = parameters.pos;
  for (const param of parameters) {
    if (!/^[\s,]*$/.test(text.slice(at, param.getStart()))) return true;
    at = param.getEnd();
  }
  return !/^[\s,]*\)/.test(text.slice(at));
}
