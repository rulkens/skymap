import type { StreamWikipedia } from '../@types/StreamWikipedia';

/** The meta fields an article sets: its title and its extract, the stream's only description. */
export function streamArticleFields(wikipedia: StreamWikipedia | null): {
  description: string | null;
  wikipediaTitle: string | null;
} {
  return {
    description: wikipedia?.extract || null,
    wikipediaTitle: wikipedia?.title ?? null,
  };
}
