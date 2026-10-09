import { defineConfig, devices } from "@playwright/test";

const ADRESSE = "http://127.0.0.1:5174";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  use: { baseURL: ADRESSE, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec vite --port 5174",
    url: ADRESSE,
    reuseExistingServer: false,
  },
});
