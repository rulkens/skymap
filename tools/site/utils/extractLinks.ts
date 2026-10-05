const ATTRIBUTE = /\s(href|src|poster|imagesrcset|srcset)="([^"]*)"/g;

/** Every URL a built page asks for: link and media attributes, with `srcset` lists split into their candidates. */
export function extractLinks(html: string): string[] {
  const out: string[] = [];
  for (const [, name, value] of html.matchAll(ATTRIBUTE)) {
    if (name!.endsWith('srcset')) {
      out.push(...value!.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]!));
    } else {
      out.push(value!);
    }
  }
  return out;
}
