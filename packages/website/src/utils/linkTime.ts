/** The instant an app link sets the clock to (its `t` parameter), or undefined when it sets none. */
export function linkTime(link: string): string | undefined {
  return /(?:^|&)t=([^&]+)/.exec(link)?.[1];
}
