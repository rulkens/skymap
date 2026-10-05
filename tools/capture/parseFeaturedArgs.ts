type CaptureOptions = { url: string; force: string[] };

export function parseArgs(argv: readonly string[]): CaptureOptions {
  const options: CaptureOptions = { url: 'http://localhost:5173', force: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--url') {
      const value = argv[++i];
      if (value === undefined) throw new Error('--url requires a value');
      const base = value.replace(/\/+$/, '');
      if (base.includes('?') || base.includes('#')) {
        throw new Error(`--url must not carry its own query or hash (got '${value}')`);
      }
      options.url = base;
    } else if (arg === '--force') {
      const ids: string[] = [];
      while (i + 1 < argv.length && !(argv[i + 1] ?? '').startsWith('--')) {
        ids.push(argv[++i] as string);
      }
      if (ids.length === 0) throw new Error('--force requires at least one card id');
      options.force.push(...ids);
    } else {
      throw new Error(`unknown flag '${arg}' (known: --url, --force)`);
    }
  }
  return options;
}
