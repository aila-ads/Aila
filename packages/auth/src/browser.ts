'use client';

import { createAuthClient } from '@neondatabase/auth/next';

let client: ReturnType<typeof createAuthClient> | undefined;

/**
 * Browser auth client. It talks only to this app's same-origin
 * /api/auth proxy, so it needs no configuration or secrets.
 */
export function createAuthBrowserClient() {
  client ??= createAuthClient();
  return client;
}
