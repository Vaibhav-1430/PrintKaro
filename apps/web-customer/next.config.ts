import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile shared workspace packages from source.
  transpilePackages: ['@print-karo/ui', '@print-karo/types', '@print-karo/auth'],
};

export default nextConfig;
