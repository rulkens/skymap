import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Component tests opt into jsdom per file with `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [react()],
  // Vite's default TypeScript transform skips .cts; the preloads are .cts (sandboxed CommonJS).
  oxc: { include: /\.([cm]?ts|[jt]sx)$/ },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
