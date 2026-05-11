/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@jasabersih/shared-types', '@jasabersih/api-client'],
  // Admin pages are auth-gated and must never be cached at the edge.
  // Without this Next defaults to s-maxage=31536000 for prerendered routes,
  // and Cloudflare keeps serving stale HTML referencing dead chunk hashes.
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/login',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};
export default nextConfig;
