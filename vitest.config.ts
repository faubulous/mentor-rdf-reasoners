import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/tests/**',
        'src/**/*.bench.ts',
        'src/**/index.ts',
        'src/**/*.interface.ts',
        'src/**/types.ts'
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100
      }
    },
    deps: {
      interopDefault: true
    }
  }
});
