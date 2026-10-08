import { defineConfig } from 'vitest/config';

// Unit tests only: no database, network or secrets are used.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
