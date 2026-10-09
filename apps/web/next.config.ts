import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@aila/auth',
    '@aila/billing',
    '@aila/db',
    '@aila/config',
    '@aila/storage',
    '@aila/ui',
    '@aila/validation',
  ],
  // SECURITY-ARCHITECTURE §13. The Content-Security-Policy is set per
  // request in proxy.ts (it carries a nonce); HSTS is sent by Vercel.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
