import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Convex function tests opt into `// @vitest-environment edge-runtime` per file.
    environment: 'node',
    server: { deps: { inline: ['convex-test'] } },
  },
});
