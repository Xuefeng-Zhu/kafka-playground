import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "192.168.50.236"],
  transpilePackages: [
    "@kplay/contracts",
    "@kplay/scenario-engine",
    "@kplay/kafka-runtime",
  ],
};

export default nextConfig;
