import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../../../apps/web/lib/csp';

describe('contentSecurityPolicy', () => {
  it('allows only nonce scripts and the storage origin in production', () => {
    const csp = contentSecurityPolicy({
      nonce: 'abc',
      storageEndpoint: 'https://bucket.storage.example.com/path',
      development: false,
    });

    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic';");
    expect(csp).toContain("connect-src 'self' https://bucket.storage.example.com;");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('adds unsafe-eval only for next dev', () => {
    const csp = contentSecurityPolicy({ nonce: 'abc', development: true });

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self';");
  });
});
