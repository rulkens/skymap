/**
 * The ordered `name: type` members of one struct, scraped from WGSL/WESL
 * source text. Feeds `layoutWgslStruct` so a uniform-parity test can take the
 * shader as the offset authority instead of restating its byte map.
 */

export type WgslStructField = { readonly name: string; readonly type: string };

export function parseWgslStructFields(source: string, structName: string): WgslStructField[] {
  // Line comments go first, or a commented-out member parses as a real one.
  const stripped = source.replace(/\/\/[^\n]*/g, '');
  const body = stripped.match(new RegExp(`struct\\s+${structName}\\s*\\{([\\s\\S]*?)\\}`));
  if (!body) throw new Error(`struct ${structName} not found`);
  const fields: WgslStructField[] = [];
  const fieldRe = /(\w+)\s*:\s*([A-Za-z0-9_<>]+)/g;
  let f: RegExpExecArray | null;
  while ((f = fieldRe.exec(body[1]!)) !== null) fields.push({ name: f[1]!, type: f[2]! });
  if (fields.length === 0) throw new Error(`struct ${structName} parsed no fields`);
  return fields;
}
