import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/.local-data/**"],
    globals: false,
    include: ["**/*.test.ts", "**/*.test.tsx"]
  }
});
