import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
const root = dirname(fileURLToPath(
import.meta.url));
export default defineConfig(
{ 
  resolve: {
    alias: {
      '@aila/validation': resolve(root, 'packages/validation/src/index.ts'),
      '@aila/auth/server': resolve(root, 'packages/auth/src/server-entry.ts'),
      '@aila/ai': resolve(root, 'packages/ai/src/index.ts'),
    }, 
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
  plugins: [
    opencodePlugin(
      
    )({
      enabled: true,
    }),
  ],
}
);