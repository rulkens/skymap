/** A file path as a literal inside a RegExp; route names like `$slug` and `(g)/a+b` are real. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
