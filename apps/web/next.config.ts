import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@aila/auth', '@aila/db', '@aila/config', '@aila/ui'],
};

export default nextConfig;
