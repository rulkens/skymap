/*
 * Review — dev-only, the second half of the overlay: when the page has an article or main region,
 * it asks tools/site/reviewPlugin.ts for the page's review (a file per page, empty until the first
 * mark) and hands it to ReviewPage. A 404 is a page nobody has cut yet and starts from an empty review;
 * the first save writes its file. Any other answer means no server to save to, so there is no review.
 */
import { useEffect, useState } from 'react';

import type { DocsReview } from '../../../../../../tools/site/@types/DocsReview';
import { wordsIn } from '../wordsIn';
import ReviewPage from '../ReviewPage/ReviewPage.tsx';
import type { JobMeta } from '../@types/JobMeta';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const ROUTE = `${BASE}__review`;

type Loaded = { article: Element; url: string; first: DocsReview; job: JobMeta | undefined };

function Review() {
  const [loaded, setLoaded] = useState<Loaded>();

  useEffect(() => {
    const article = document.getElementById('page') ?? document.getElementById('main');
    if (!article) return;
    let stale = false;
    const page = `/${location.pathname.slice(BASE.length)}`;
    const url = `${ROUTE}?page=${encodeURIComponent(page)}`;
    void (async () => {
      const found = await fetch(url).catch(() => null);
      if (found?.status !== 200 && found?.status !== 404) return;
      const first: DocsReview = found.ok
        ? ((await found.json()) as DocsReview)
        : { page, words: { before: wordsIn(article.textContent ?? '') }, marks: [] };
      // The job is not in the review file: the page carries it from its text's front matter (layouts/Base.astro).
      const meta = document.querySelector<HTMLMetaElement>('meta[name="skymap:job"]');
      const job = meta ? { text: meta.content, setIn: meta.dataset.setIn } : undefined;
      if (!stale) setLoaded({ article, url, first, job });
    })();
    return () => {
      stale = true;
    };
  }, []);

  return loaded && <ReviewPage {...loaded} />;
}

export default Review;
