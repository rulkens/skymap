/** asteroidLabel — MPC's own spelling, `(433) Eros`; the number alone when unnamed. The card and the palette share it. */
export function asteroidLabel(number: number, name: string | null): string {
  return name === null ? `(${number})` : `(${number}) ${name}`;
}
