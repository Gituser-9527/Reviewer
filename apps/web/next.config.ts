import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  // The Next.js development tool launcher is not part of the product UI and overlaps the sidebar footer.
  devIndicators: false,
  output: 'standalone',
  transpilePackages: ['@job-compliance/shared'],
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
