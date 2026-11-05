import { posix } from 'node:path';

/** `./x` or `../x` from a directory to a path; `.` for the directory itself. */
export function relativeSpecifier(fromDir: string, target: string): string {
  const rel = posix.relative(fromDir, target);
  if (rel === '') return '.';
  return rel === '..' || rel.startsWith('../') ? rel : `./${rel}`;
}
