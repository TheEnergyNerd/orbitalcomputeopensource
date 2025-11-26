/** @type {import('next').NextConfig} */
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const nextConfig = {
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      cesium: "cesium",
    };

    // Exclude public directory from webpack processing
    // Files in public/ should be served as static assets, not processed
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/public/**', '**/node_modules/**'],
    };

    // Exclude Cesium worker files from Terser minification
    if (config.optimization && config.optimization.minimizer) {
      config.optimization.minimizer = config.optimization.minimizer.map((plugin) => {
        if (plugin.constructor.name === "TerserPlugin") {
          const originalExclude = plugin.options?.exclude || [];
          plugin.options = {
            ...plugin.options,
            exclude: Array.isArray(originalExclude) 
              ? [...originalExclude, /cesium\/Workers/, /public\/cesium/]
              : [originalExclude, /cesium\/Workers/, /public\/cesium/],
          };
        }
        return plugin;
      });
    }

    if (!isServer) {
      // Copy Cesium assets to public folder
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            {
              from: path.join(__dirname, "node_modules/cesium/Build/Cesium/Workers"),
              to: path.join(__dirname, "public/cesium/Workers"),
            },
            {
              from: path.join(__dirname, "node_modules/cesium/Build/Cesium/ThirdParty"),
              to: path.join(__dirname, "public/cesium/ThirdParty"),
            },
            {
              from: path.join(__dirname, "node_modules/cesium/Build/Cesium/Assets"),
              to: path.join(__dirname, "public/cesium/Assets"),
            },
            {
              from: path.join(__dirname, "node_modules/cesium/Build/Cesium/Widgets"),
              to: path.join(__dirname, "public/cesium/Widgets"),
            },
          ],
        })
      );
    }

    return config;
  },
  env: {
    CESIUM_BASE_URL: "/cesium",
  },
  // Disable caching in development to prevent stale builds
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
};

module.exports = nextConfig;

