import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API requests to the agent server during development
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://localhost:${process.env["API_PORT"] ?? "3011"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
