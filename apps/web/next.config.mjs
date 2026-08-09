import { fileURLToPath } from "node:url";
import path from "node:path";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: monorepoRoot,
  // Workspace packages ship raw TypeScript source; Next compiles them in-place.
  transpilePackages: ["@finaltab/engine", "@finaltab/keeperhub", "@finaltab/vision"],
  webpack: (config) => {
    // Workspace packages use NodeNext ".js" specifiers that resolve to .ts sources.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
