import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@enterprise-brain/contracts': new URL(
        './packages/contracts/src/index.ts',
        import.meta.url
      ).pathname,
      '@enterprise-brain/database': new URL(
        './packages/database/src/index.ts',
        import.meta.url
      ).pathname,
      '@enterprise-brain/domain': new URL(
        './packages/domain/src/index.ts',
        import.meta.url
      ).pathname
    }
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
});
