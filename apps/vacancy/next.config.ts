import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@lumen/pdok-client", "@lumen/bag-utils"],
  // experimental: {
  //   reactCompiler: false,
  // },
  // MapLibre GL requires specific webpack handling
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "maplibre-gl": "maplibre-gl",
    };
    return config;
  },
};

export default nextConfig;
