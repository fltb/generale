import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    reporters: ['verbose'],
    env: {
      DB_FILE_NAME: ':memory:',
    },
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**']
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});
