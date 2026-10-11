/** The heading a name is filed under in a list cut by letter: its first letter without accent, or `0–9`. */
export function objectLetter(name: string): string {
  const first = name.normalize('NFD')[0]!.toUpperCase();
  return /[A-Z]/.test(first) ? first : '0–9';
}
