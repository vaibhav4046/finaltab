import { defineConfig } from "vitest/config";

// Only the pure, framework-free modules under lib/ are unit-tested here.
// Component and route rendering is covered by driving the real app, not jsdom.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    environment: "node",
  },
});
