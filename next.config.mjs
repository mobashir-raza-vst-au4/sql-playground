/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // sql.js ships a wasm file and references node fs; stub it for the browser.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
  // PGlite ships wasm/data assets that should not be bundled/optimized by webpack.
  experimental: {
    esmExternals: true,
  },
};

export default nextConfig;
