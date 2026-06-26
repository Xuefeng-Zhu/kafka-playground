import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "packages/**/*.test.ts",
      "apps/web/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": "/apps/web",
      "@kplay/contracts": "/packages/contracts/src/index.ts",
      "@kplay/scenario-engine": "/packages/scenario-engine/src/index.ts",
      "@kplay/kafka-runtime": "/packages/kafka-runtime/src/index.ts",
      "server-only": "/tests/stubs/server-only.ts",
    },
  },
});
