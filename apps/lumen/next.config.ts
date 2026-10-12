import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@lumen/design-system", "@lumen/pdok-client", "@lumen/world"],
};

export default nextConfig;
