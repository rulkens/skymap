/** The file name of a landing page's card in assets/cards/: "/domes/" → "domes.jpg". */
export function shareCardFile(path: string): string {
  return `${path.replaceAll('/', '')}.jpg`;
}
