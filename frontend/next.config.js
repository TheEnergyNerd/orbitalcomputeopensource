/** @type {import('next').NextConfig} */
const nextConfig = {
  // Re-enable SWC minification now that Cesium is removed
  swcMinify: true,
  webpack: (config, { isServer }) => {
    // Exclude public directory from webpack processing
    // Files in public/ should be served as static assets, not processed
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/public/**", "**/node_modules/**"],
    };

    return config;
  },
  // Disable caching in development to prevent stale builds
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Ensure chunks are properly generated
  experimental: {
    optimizeCss: false,
  },
  // Add headers to prevent browser caching of chunks in dev mode
  // Only apply in production to avoid dev server issues
  async headers() {
    if (process.env.NODE_ENV === 'production') {
      return [
        {
          source: '/_next/static/chunks/:path*',
          headers: [
            {
              key: 'Cache-Control',
              value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            },
          ],
        },
        {
          source: '/_next/static/:path*',
          headers: [
            {
              key: 'Cache-Control',
              value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            },
          ],
        },
      ];
    }
    return [];
  },
};

module.exports = nextConfig;
