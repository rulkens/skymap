/** `n` words, in words: "1 word", "12 words". */
export function wordCount(n: number): string {
  return `${n} ${n === 1 ? 'word' : 'words'}`;
}
