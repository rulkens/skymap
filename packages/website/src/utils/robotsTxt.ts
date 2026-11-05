// Search and retrieval crawlers named so anyone auditing the AI policy sees the site opts in; the wildcard already covers them.
const CRAWLERS = [
  'OAI-SearchBot',
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'Amazonbot',
  'DuckAssistBot',
  'CCBot',
];

/** The live site's robots.txt: everything allowed, and the sitemap named. */
export function robotsTxt(sitemapUrl: string): string {
  const allow = ['*', ...CRAWLERS].map((agent) => `User-agent: ${agent}\nAllow: /\n`);
  return `${allow.join('\n')}\nSitemap: ${sitemapUrl}\n`;
}
