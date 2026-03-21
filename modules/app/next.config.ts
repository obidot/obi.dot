import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appRoot, "../..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      // MetaMask's RN storage adapter is optional for web builds.
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
  // Proxy API requests to the agent server during development
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://localhost:${process.env.API_PORT ?? "3001"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
