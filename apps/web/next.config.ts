import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@aila/auth',
    '@aila/db',
    '@aila/config',
    '@aila/storage',
    '@aila/ui',
    '@aila/validation',
  ],
};

export default nextConfig;
