import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/infrastructure/database/schema.ts",
    "./src/infrastructure/database/catalog-schema.ts",
    "./src/infrastructure/database/profile-schema.ts",
    "./src/infrastructure/database/file-schema.ts",
  ],
  out: "./drizzle",
});
