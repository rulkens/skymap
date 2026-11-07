/** A room code in fours: easier to read off the screen and type on a tablet than eight in a row. */
export function groupedCode(code: string): string {
  return code.match(/.{1,4}/g)?.join(' ') ?? code;
}
