import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'perception-scripts', environment: 'node', include: ['*.test.ts'] } });
