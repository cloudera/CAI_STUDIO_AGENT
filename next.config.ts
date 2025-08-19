import type { NextConfig } from 'next';

// Load environment variables from .env files
require('dotenv').config();

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // For now, remove or omit the `webpack` override,
  // so Turbopack doesn't complain in dev mode:
  // webpack(config, options) {
  //   // (Removed custom chunk-splitting)
  //   return config;
  // },

  turbopack: {
    // Turbopack is now stable! Place any Turbopack-specific config here
  },
  
  env: {
    // Make environment variables available to the client
    // Add any environment variables you want to expose to the client here
    // Note: Only add non-sensitive variables that are safe to expose
  },

  async rewrites() {
    // Proxy port is always 50052 (where our ops proxy runs)
    const proxyPort = '50052';
    return [
      // Phoenix ops UI - handle trailing slash properly
      {
        source: '/api/ops/',
        destination: `http://localhost:${proxyPort}/`,
      },
      {
        source: '/api/ops/:path*',
        destination: `http://localhost:${proxyPort}/:path*`,
      },
      {
        source: '/api/ops',
        destination: `http://localhost:${proxyPort}/`,
      },
      // Kombu events endpoint
      {
        source: '/api/ops/events',
        destination: `http://localhost:${proxyPort}/events`,
      },
      {
        source: '/api/ops/events/:path*',
        destination: `http://localhost:${proxyPort}/events/:path*`,
      },
    ];
  },
};

export default nextConfig;
