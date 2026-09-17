import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'skills/*/tests/**/*.test.ts'],
    environment: 'node',
  },
});
