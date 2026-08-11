import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = fileURLToPath(new URL(".", import.meta.url)).replaceAll("\\", "/");

// Only the pure, framework-free modules under lib/ are unit-tested here.
// Component and route rendering is covered by driving the real app, not jsdom.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: webRoot,
      },
      // Next's "server-only" marker only resolves inside Next's bundler;
      // plain-Node tests ARE server side, so substitute an empty module.
      {
        find: "server-only",
        replacement: fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
      },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    environment: "node",
  },
});
