import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], maxWorkers: 2 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          physics: ["@dimforge/rapier3d-compat"],
        },
      },
    },
  },
});
