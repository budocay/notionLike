import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "web",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/preparation.ts"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
