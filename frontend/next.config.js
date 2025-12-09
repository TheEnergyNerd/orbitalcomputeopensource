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
};

module.exports = nextConfig;
