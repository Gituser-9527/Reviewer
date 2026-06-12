import type { NextConfig } from 'next';

const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/u, '');

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@job-compliance/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
