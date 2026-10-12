import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "contrats",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
