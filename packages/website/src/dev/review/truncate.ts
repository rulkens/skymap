/** `text` cut to `max` characters, with an ellipsis where it was cut. */
export const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;
