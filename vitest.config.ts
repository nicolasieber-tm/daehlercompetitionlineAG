import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    // Die 42-Dateien-Parser-Tests lesen und parsen die realen Preislisten
    // mehrfach (je Test neu), das dauert länger als das vitest-Standardlimit
    // von 5000ms.
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
