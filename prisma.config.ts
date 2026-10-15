import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` needs no database connection, so DATABASE_URL is only
// passed to Prisma when it is set. Commands that connect (migrate status,
// migrate deploy) fail with Prisma's own error when it is missing.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
  },

  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
