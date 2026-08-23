/**
 * /api/resolve — paste-a-page-URL → ResolvedMedia.
 *
 * Mirrors the dependency-injection shape of `handleFetch` (see
 * routes/fetch.ts:51-111): no module-level I/O, all collaborators
 * injected, failures thrown rather than returned as error envelopes.
 *
 * Why typed errors instead of `{ ok: false, code }` envelopes: the
 * routing layer in apiPlugin.ts (Task 5) dispatches HTTP status codes
 * by `err instanceof UnknownHostError` etc., so the *class identity*
 * is the contract.  Messages are for humans (logs, debug tooling); the
 * `cause` chain on UpstreamError preserves the original network error
 * without making it part of the dispatch surface.
 *
 * Why malformed URLs collapse into UnknownHostError: from the user's
 * perspective the failure mode is identical ("we don't recognise this
 * page") and adding a fourth error class for "your input isn't a URL"
 * buys nothing the 400 already conveys.
 *
 * Why the handler doesn't import noirlabResolver at runtime: the
 * `hostDispatch` map is the seam.  apiPlugin wires the real resolver
 * in; tests inject stubs.  Only the `ResolvedMedia` shape is shared,
 * and it crosses as a type-only import — no value-level coupling.
 */
import type { ResolvedMedia } from '../noirlabResolver.ts';

export type ResolverFn = (html: string, pageUrl: string) => ResolvedMedia | null;
export type HtmlFetcher = (url: string) => Promise<string>;

export class UnknownHostError extends Error {}
export class UnscrapeableError extends Error {}
export class UpstreamError extends Error {}

export async function handleResolve(opts: {
  body: { url: string };
  htmlFetcher: HtmlFetcher;
  hostDispatch: Map<string, ResolverFn>;
}): Promise<ResolvedMedia> {
  let parsed: URL;
  try {
    parsed = new URL(opts.body.url);
  } catch {
    throw new UnknownHostError(`could not parse URL: ${opts.body.url}`);
  }

  const resolver = opts.hostDispatch.get(parsed.hostname);
  if (!resolver) {
    throw new UnknownHostError(`no resolver registered for host: ${parsed.hostname}`);
  }

  let html: string;
  try {
    html = await opts.htmlFetcher(opts.body.url);
  } catch (original) {
    throw new UpstreamError(`failed to fetch ${opts.body.url}`, { cause: original });
  }

  const resolved = resolver(html, opts.body.url);
  if (resolved === null) {
    throw new UnscrapeableError(`resolver returned no media for ${opts.body.url}`);
  }
  return resolved;
}
