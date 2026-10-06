import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@common": fileURLToPath(new URL("../common", import.meta.url)),
      // Same mapping as tsconfig: the generated client lives in src/database/models.
      "@prisma/client": fileURLToPath(new URL("./src/database/models", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
