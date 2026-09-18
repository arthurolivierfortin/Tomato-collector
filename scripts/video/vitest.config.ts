import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'video', environment: 'node', include: ['{lib,plans,scenarios}/**/*.test.ts'] } });
