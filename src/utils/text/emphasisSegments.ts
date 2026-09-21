/**
 * emphasisSegments — split authored copy on its `<i>…</i>` spans. Even indices
 * are plain, odd indices emphasised, so a caller renders real `<i>` elements
 * without `dangerouslySetInnerHTML`. `<i>` is the only markup view copy uses;
 * anything else stays literal text.
 */

export function emphasisSegments(text: string): readonly string[] {
  return text.split(/<i>|<\/i>/);
}
