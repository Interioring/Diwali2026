import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so unit tests don't boot the Cloudflare runtime.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
