import type { NextConfig } from "next";

const apiProxyTarget = (process.env.API_PROXY_TARGET ?? "http://localhost:4000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.NGROK_HOST ? [process.env.NGROK_HOST] : [],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
