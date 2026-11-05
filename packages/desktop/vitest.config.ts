import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Component tests opt into jsdom per file with `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
