import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'scripts/video', 'scripts/perception'],
  },
});
