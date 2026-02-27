import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API requests to the agent server during development
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3100/api/:path*",
      },
    ];
  },
};

export default nextConfig;
