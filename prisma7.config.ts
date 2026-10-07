// Prisma 7 configuration: the datasource URL lives here and .env is not loaded
// automatically, hence the dotenv import. See BUILD_LOG.md.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
