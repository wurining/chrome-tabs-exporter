import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.mjs",
  timeout: 30000,
  workers: 1,
  reporter: "list",
  use: { trace: "retain-on-failure" }
});
