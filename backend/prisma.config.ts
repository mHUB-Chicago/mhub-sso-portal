import type { PrismaConfig } from "prisma";
export default {
  schema: "src/database/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  }
} as PrismaConfig;
