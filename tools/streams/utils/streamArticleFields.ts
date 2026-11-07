import type { StreamWikipedia } from '../@types/StreamWikipedia';

/** The meta fields an article sets: its title, and its extract in place of the build's own description. */
export function streamArticleFields(
  wikipedia: StreamWikipedia | null,
  description: string,
): { description: string; wikipediaTitle: string | null } {
  return {
    description: wikipedia?.extract || description,
    wikipediaTitle: wikipedia?.title ?? null,
  };
}
